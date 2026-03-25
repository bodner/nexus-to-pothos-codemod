import { Transform } from "jscodeshift/src/core";
import path from "path";
import ts from "typescript";

type TypeContext = {
  program: ts.Program;
  checker: ts.TypeChecker;
};

const typeContextCache = new Map<string, TypeContext>();

const createSingleFileContext = (filePath: string): TypeContext => {
  const program = ts.createProgram([filePath], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    strictNullChecks: true,
    skipLibCheck: true,
    noEmit: true
  });

  return {
    program,
    checker: program.getTypeChecker()
  };
};

const getProjectTypeContext = (filePath: string): TypeContext => {
  const normalizedFilePath = path.resolve(filePath);
  const configPath = ts.findConfigFile(
    path.dirname(normalizedFilePath),
    ts.sys.fileExists,
    "tsconfig.json"
  );

  if (!configPath) {
    return createSingleFileContext(normalizedFilePath);
  }

  if (typeContextCache.has(configPath)) {
    return typeContextCache.get(configPath);
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error || !configFile.config) {
    return createSingleFileContext(normalizedFilePath);
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath)
  );

  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: {
      ...parsedConfig.options,
      strictNullChecks: true,
      skipLibCheck: true,
      noEmit: true
    }
  });

  const context: TypeContext = {
    program,
    checker: program.getTypeChecker()
  };

  typeContextCache.set(configPath, context);
  return context;
};

const isObjectProperty = node =>
  node?.type === "ObjectProperty" || node?.type === "Property";

const getPropertyKeyName = property => {
  if (!property?.key) {
    return null;
  }

  if (property.key.type === "Identifier") {
    return property.key.name;
  }

  if (property.key.type === "StringLiteral") {
    return property.key.value;
  }

  return null;
};

const includesNullish = (type: ts.Type) => {
  if (
    type.flags &
    (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)
  ) {
    return true;
  }

  if (type.isUnionOrIntersection()) {
    return type.types.some(includesNullish);
  }

  return false;
};

const getObjectRefTypeMap = (
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker
) => {
  const refTypeMap = new Map<string, ts.Type>();

  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const initializer = node.initializer;
      if (
        initializer &&
        ts.isCallExpression(initializer) &&
        ts.isPropertyAccessExpression(initializer.expression)
      ) {
        const callTarget = initializer.expression;
        const methodName = callTarget.name.text;
        const isObjectRefCall =
          ts.isIdentifier(callTarget.expression) &&
          callTarget.expression.text === "builder" &&
          ["objectRef", "interfaceRef"].includes(methodName);

        if (isObjectRefCall && initializer.typeArguments?.length) {
          const objectType = checker.getTypeFromTypeNode(
            initializer.typeArguments[0]
          );
          refTypeMap.set(node.name.text, objectType);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return refTypeMap;
};

const getFieldNullable = (
  objectType: ts.Type,
  fieldName: string,
  checker: ts.TypeChecker
) => {
  const propertyType = checker.getTypeOfPropertyOfType(objectType, fieldName);
  if (!propertyType) {
    return undefined;
  }

  const propertySymbol = objectType.getProperty(fieldName);
  const isOptional = Boolean(propertySymbol?.flags & ts.SymbolFlags.Optional);

  if (isOptional) {
    return true;
  }

  return includesNullish(propertyType);
};

const getFieldsObject = fieldsFunction => {
  if (!fieldsFunction) {
    return null;
  }

  if (fieldsFunction.type === "ArrowFunctionExpression") {
    if (fieldsFunction.body?.type === "ObjectExpression") {
      return fieldsFunction.body;
    }

    if (fieldsFunction.body?.type === "BlockStatement") {
      const returnStatement = fieldsFunction.body.body.find(
        statement => statement.type === "ReturnStatement"
      );
      return returnStatement?.argument?.type === "ObjectExpression"
        ? returnStatement.argument
        : null;
    }
  }

  if (fieldsFunction.type === "FunctionExpression") {
    const returnStatement = fieldsFunction.body?.body?.find(
      statement => statement.type === "ReturnStatement"
    );
    return returnStatement?.argument?.type === "ObjectExpression"
      ? returnStatement.argument
      : null;
  }

  return null;
};

const transform: Transform = (file, api) => {
  const j = api.jscodeshift;
  const root = j(file.source);

  const hasExposeCalls =
    root
      .find(j.CallExpression, {
        callee: {
          type: "MemberExpression",
          property: {
            type: "Identifier",
            name: (name: string) => name.startsWith("expose")
          }
        }
      })
      .size() > 0;

  if (!hasExposeCalls) {
    return file.source;
  }

  const hasImplementCalls =
    root
      .find(j.CallExpression, {
        callee: {
          type: "MemberExpression",
          property: { type: "Identifier", name: "implement" }
        }
      })
      .size() > 0;

  if (!hasImplementCalls) {
    return file.source;
  }

  let { program, checker } = getProjectTypeContext(file.path);
  let sourceFile = program.getSourceFile(path.resolve(file.path));
  if (!sourceFile) {
    const singleFileContext = createSingleFileContext(file.path);
    program = singleFileContext.program;
    checker = singleFileContext.checker;
    sourceFile = program.getSourceFile(path.resolve(file.path));
  }

  if (!sourceFile) {
    return file.source;
  }

  const objectRefTypeMap = getObjectRefTypeMap(sourceFile, checker);

  root
    .find(j.CallExpression, {
      callee: {
        type: "MemberExpression",
        property: { type: "Identifier", name: "implement" }
      }
    })
    .forEach(path => {
      const calleeObject = path.value.callee.object;
      if (calleeObject?.type !== "Identifier") {
        return;
      }

      const objectType = objectRefTypeMap.get(calleeObject.name);
      if (!objectType) {
        return;
      }

      const implementConfig = path.value.arguments[0];
      if (implementConfig?.type !== "ObjectExpression") {
        return;
      }

      const fieldsProperty = implementConfig.properties.find(
        property =>
          isObjectProperty(property) &&
          getPropertyKeyName(property) === "fields"
      );

      if (!fieldsProperty || !isObjectProperty(fieldsProperty)) {
        return;
      }

      const fieldsFunction = fieldsProperty.value;
      const fieldsObject = getFieldsObject(fieldsFunction);
      if (!fieldsObject) {
        return;
      }

      const fieldsParamName =
        fieldsFunction.params?.[0]?.type === "Identifier"
          ? fieldsFunction.params[0].name
          : null;
      if (!fieldsParamName) {
        return;
      }

      fieldsObject.properties.forEach(fieldProperty => {
        if (!isObjectProperty(fieldProperty)) {
          return;
        }

        const fieldCall = fieldProperty.value;
        if (fieldCall?.type !== "CallExpression") {
          return;
        }

        const fieldCallee = fieldCall.callee;
        if (
          fieldCallee?.type !== "MemberExpression" ||
          fieldCallee.object?.type !== "Identifier" ||
          fieldCallee.object.name !== fieldsParamName ||
          fieldCallee.property?.type !== "Identifier" ||
          !fieldCallee.property.name.startsWith("expose")
        ) {
          return;
        }

        const fieldNameArg = fieldCall.arguments[0];
        if (fieldNameArg?.type !== "StringLiteral") {
          return;
        }

        const nullableValue = getFieldNullable(
          objectType,
          fieldNameArg.value,
          checker
        );

        if (typeof nullableValue !== "boolean") {
          return;
        }

        const nullableProperty = j.property(
          "init",
          j.identifier("nullable"),
          j.booleanLiteral(nullableValue)
        );

        if (!fieldCall.arguments[1]) {
          fieldCall.arguments[1] = j.objectExpression([nullableProperty]);
          return;
        }

        const optionsArg = fieldCall.arguments[1];
        if (optionsArg.type !== "ObjectExpression") {
          return;
        }

        const hasNullable = optionsArg.properties.some(
          property =>
            isObjectProperty(property) &&
            getPropertyKeyName(property) === "nullable"
        );

        if (!hasNullable) {
          optionsArg.properties.push(nullableProperty);
        }
      });
    });

  return root.toSource();
};

export default transform;
