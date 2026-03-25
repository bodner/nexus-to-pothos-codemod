import fs from "fs";
import path from "path";
import { Transform } from "jscodeshift/src/core";

type FieldNullability = {
  isList: boolean;
  listNullable: boolean;
  itemsNullable: boolean;
};

type TypeFieldMap = Map<string, FieldNullability>;
type SchemaTypeMap = Map<string, TypeFieldMap>;
type ParsedSchemaMaps = {
  objectTypes: SchemaTypeMap;
  inputTypes: SchemaTypeMap;
};

type TypeRefNode =
  | { kind: "named"; name: string }
  | { kind: "list"; ofType: TypeRefNode }
  | { kind: "nonNull"; ofType: TypeRefNode };

const schemaCache = new Map<string, ParsedSchemaMaps>();
const missingSchemaWarnings = new Set<string>();

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

const parseTypeRef = (typeText: string): TypeRefNode | null => {
  const text = typeText.replace(/\s+/g, "");
  let index = 0;

  const parseNode = (): TypeRefNode | null => {
    let node: TypeRefNode | null = null;

    if (text[index] === "[") {
      index += 1;
      const inner = parseNode();
      if (!inner || text[index] !== "]") {
        return null;
      }
      index += 1;
      node = { kind: "list", ofType: inner };
    } else {
      const start = index;
      while (/[_A-Za-z0-9]/.test(text[index] || "")) {
        index += 1;
      }
      const name = text.slice(start, index);
      if (!name) {
        return null;
      }
      node = { kind: "named", name };
    }

    if (text[index] === "!") {
      index += 1;
      node = { kind: "nonNull", ofType: node };
    }

    return node;
  };

  const node = parseNode();
  if (!node || index !== text.length) {
    return null;
  }

  return node;
};

const toFieldNullability = (node: TypeRefNode): FieldNullability => {
  const outerIsNonNull = node.kind === "nonNull";
  const outerType = outerIsNonNull ? node.ofType : node;

  if (outerType.kind !== "list") {
    return {
      isList: false,
      listNullable: !outerIsNonNull,
      itemsNullable: false
    };
  }

  const itemType = outerType.ofType;
  const itemIsNonNull = itemType.kind === "nonNull";

  return {
    isList: true,
    listNullable: !outerIsNonNull,
    itemsNullable: !itemIsNonNull
  };
};

const extractDefinitionBlocks = (schemaText: string) => {
  const blocks: Array<{
    kind: "type" | "input";
    typeName: string;
    block: string;
  }> = [];
  const definitionRegex =
    /(^|\n)\s*(type|input)\s+([_A-Za-z][_0-9A-Za-z]*)\b[^\{]*\{/g;
  let match: RegExpExecArray | null;

  while ((match = definitionRegex.exec(schemaText))) {
    const kind = match[2] as "type" | "input";
    const typeName = match[3];
    const openBraceIndex = schemaText.indexOf("{", match.index);
    if (openBraceIndex < 0) {
      continue;
    }

    let depth = 1;
    let cursor = openBraceIndex + 1;

    while (cursor < schemaText.length && depth > 0) {
      const ch = schemaText[cursor];
      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
      }
      cursor += 1;
    }

    if (depth !== 0) {
      continue;
    }

    const block = schemaText.slice(openBraceIndex + 1, cursor - 1);
    blocks.push({ kind, typeName, block });
    definitionRegex.lastIndex = cursor;
  }

  return blocks;
};

const parseSchemaMaps = (schemaText: string): ParsedSchemaMaps => {
  const objectTypes: SchemaTypeMap = new Map();
  const inputTypes: SchemaTypeMap = new Map();

  extractDefinitionBlocks(schemaText).forEach(({ kind, typeName, block }) => {
    const fieldMap: TypeFieldMap = new Map();

    block.split("\n").forEach(line => {
      const trimmed = line.split("#")[0].trim();
      if (!trimmed) {
        return;
      }

      const fieldMatch = trimmed.match(
        /^([_A-Za-z][_0-9A-Za-z]*)\s*(?:\([^)]*\))?\s*:\s*([_A-Za-z\[\]!][_0-9A-Za-z\[\]!\s]*)/
      );

      if (!fieldMatch) {
        return;
      }

      const fieldName = fieldMatch[1];
      const typeRefText = fieldMatch[2].trim();
      const typeRefNode = parseTypeRef(typeRefText);
      if (!typeRefNode) {
        return;
      }

      fieldMap.set(fieldName, toFieldNullability(typeRefNode));
    });

    if (fieldMap.size > 0) {
      if (kind === "input") {
        inputTypes.set(typeName, fieldMap);
      } else {
        objectTypes.set(typeName, fieldMap);
      }
    }
  });

  return {
    objectTypes,
    inputTypes
  };
};

const getSchemaMaps = (schemaPathOption: string): ParsedSchemaMaps | null => {
  const resolvedPath = path.isAbsolute(schemaPathOption)
    ? schemaPathOption
    : path.resolve(process.cwd(), schemaPathOption);

  if (schemaCache.has(resolvedPath)) {
    return schemaCache.get(resolvedPath);
  }

  if (!fs.existsSync(resolvedPath)) {
    if (!missingSchemaWarnings.has(resolvedPath)) {
      missingSchemaWarnings.add(resolvedPath);
      console.warn(
        `[codemod] schema file not found at ${resolvedPath}; skipping nullability alignment.`
      );
    }
    return null;
  }

  const schemaText = fs.readFileSync(resolvedPath, "utf8");
  const schemaMaps = parseSchemaMaps(schemaText);
  schemaCache.set(resolvedPath, schemaMaps);
  return schemaMaps;
};

const upsertObjectProperty = (j, optionsObject, keyName, valueNode) => {
  const propertyNode = j.property("init", j.identifier(keyName), valueNode);

  const existingIndex = optionsObject.properties.findIndex(
    property =>
      isObjectProperty(property) && getPropertyKeyName(property) === keyName
  );

  if (existingIndex >= 0) {
    optionsObject.properties[existingIndex] = propertyNode;
    return;
  }

  optionsObject.properties.push(propertyNode);
};

const createNullableValueNode = (j, fieldNullability: FieldNullability) => {
  if (!fieldNullability.isList) {
    return j.booleanLiteral(fieldNullability.listNullable);
  }

  return j.objectExpression([
    j.property(
      "init",
      j.identifier("list"),
      j.booleanLiteral(fieldNullability.listNullable)
    ),
    j.property(
      "init",
      j.identifier("items"),
      j.booleanLiteral(fieldNullability.itemsNullable)
    )
  ]);
};

const createRequiredValueNode = (j, fieldNullability: FieldNullability) => {
  if (!fieldNullability.isList) {
    return j.booleanLiteral(!fieldNullability.listNullable);
  }

  return j.objectExpression([
    j.property(
      "init",
      j.identifier("list"),
      j.booleanLiteral(!fieldNullability.listNullable)
    ),
    j.property(
      "init",
      j.identifier("items"),
      j.booleanLiteral(!fieldNullability.itemsNullable)
    )
  ]);
};

const getAlignedExposeMethodName = (
  methodName: string,
  fieldNullability: FieldNullability
) => {
  if (methodName === "expose") {
    return methodName;
  }

  if (!/^expose[A-Za-z0-9]+(?:List)?$/.test(methodName)) {
    return methodName;
  }

  const endsWithList = methodName.endsWith("List");
  if (fieldNullability.isList && !endsWithList) {
    return `${methodName}List`;
  }

  if (!fieldNullability.isList && endsWithList) {
    return methodName.slice(0, -4);
  }

  return methodName;
};

const getAlignedInputHelperMethodName = (
  methodName: string,
  fieldNullability: FieldNullability
) => {
  if (methodName === "field") {
    return methodName;
  }

  if (!/^[A-Za-z0-9]+(?:List)?$/.test(methodName)) {
    return methodName;
  }

  const endsWithList = methodName.endsWith("List");
  if (fieldNullability.isList && !endsWithList) {
    return `${methodName}List`;
  }

  if (!fieldNullability.isList && endsWithList) {
    return methodName.slice(0, -4);
  }

  return methodName;
};

const getAlignedObjectHelperMethodName = (
  methodName: string,
  fieldNullability: FieldNullability
) => {
  const supportedObjectHelpers = new Set([
    "boolean",
    "int",
    "string",
    "id",
    "float",
    "date",
    "datetime",
    "timestamp",
    "json",
    "jsonObject"
  ]);

  const baseName = methodName.endsWith("List")
    ? methodName.slice(0, -4)
    : methodName;

  if (!supportedObjectHelpers.has(baseName)) {
    return methodName;
  }

  const endsWithList = methodName.endsWith("List");
  if (fieldNullability.isList && !endsWithList) {
    return `${methodName}List`;
  }

  if (!fieldNullability.isList && endsWithList) {
    return baseName;
  }

  return methodName;
};

const transform: Transform = (file, api, options) => {
  const j = api.jscodeshift;
  const root = j(file.source);

  const hasImplementCalls =
    root
      .find(j.CallExpression, {
        callee: {
          type: "MemberExpression",
          property: { type: "Identifier", name: "implement" }
        }
      })
      .size() > 0;

  const hasInputTypeCalls =
    root
      .find(j.CallExpression, {
        callee: {
          type: "MemberExpression",
          object: { type: "Identifier", name: "builder" },
          property: { type: "Identifier", name: "inputType" }
        }
      })
      .size() > 0;

  if (!hasImplementCalls && !hasInputTypeCalls) {
    return file.source;
  }

  const schemaPathOption =
    typeof options?.schemaPath === "string" && options.schemaPath
      ? options.schemaPath
      : typeof options?.schema === "string" && options.schema
        ? options.schema
        : "schema.graphql";

  const schemaMaps = getSchemaMaps(schemaPathOption);
  if (!schemaMaps) {
    return file.source;
  }
  const objectTypeSchemaMap = schemaMaps.objectTypes;
  const inputTypeSchemaMap = schemaMaps.inputTypes;

  const typeRefNameMap = new Map<string, string>();

  root.find(j.VariableDeclarator).forEach(path => {
    if (path.value.id?.type !== "Identifier") {
      return;
    }

    const init = path.value.init;
    if (
      init?.type !== "CallExpression" ||
      init.callee?.type !== "MemberExpression" ||
      init.callee.object?.type !== "Identifier" ||
      init.callee.object.name !== "builder" ||
      init.callee.property?.type !== "Identifier" ||
      !["objectRef", "interfaceRef"].includes(init.callee.property.name)
    ) {
      return;
    }

    const graphqlTypeNameArg = init.arguments?.[0];
    if (graphqlTypeNameArg?.type === "StringLiteral") {
      typeRefNameMap.set(path.value.id.name, graphqlTypeNameArg.value);
    }
  });

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

      const graphqlTypeName = typeRefNameMap.get(calleeObject.name);
      if (!graphqlTypeName) {
        return;
      }

      const typeFields = objectTypeSchemaMap.get(graphqlTypeName);
      if (!typeFields) {
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

        const graphQLFieldName = getPropertyKeyName(fieldProperty);
        if (!graphQLFieldName) {
          return;
        }

        const schemaFieldNullability = typeFields.get(graphQLFieldName);
        if (!schemaFieldNullability) {
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
          fieldCallee.property?.type !== "Identifier"
        ) {
          return;
        }

        const methodName = fieldCallee.property.name;
        const isExposeMethod = methodName.startsWith("expose");
        const isFieldMethod = methodName === "field";
        const alignedObjectHelperMethodName = getAlignedObjectHelperMethodName(
          methodName,
          schemaFieldNullability
        );
        const isObjectHelperMethod =
          alignedObjectHelperMethodName !== methodName;
        const supportsObjectHelperWithoutRename =
          alignedObjectHelperMethodName === methodName &&
          [
            "boolean",
            "int",
            "string",
            "id",
            "float",
            "booleanList",
            "intList",
            "stringList",
            "idList",
            "floatList",
            "date",
            "datetime",
            "timestamp",
            "json",
            "jsonObject",
            "dateList",
            "datetimeList",
            "timestampList",
            "jsonList",
            "jsonObjectList"
          ].includes(methodName);

        if (
          !isExposeMethod &&
          !isFieldMethod &&
          !supportsObjectHelperWithoutRename &&
          !isObjectHelperMethod
        ) {
          return;
        }

        if (isExposeMethod) {
          const alignedMethodName = getAlignedExposeMethodName(
            methodName,
            schemaFieldNullability
          );
          if (alignedMethodName !== methodName) {
            fieldCallee.property = j.identifier(alignedMethodName);
          }
        } else if (isObjectHelperMethod) {
          fieldCallee.property = j.identifier(alignedObjectHelperMethodName);
        }

        const nullableValueNode = createNullableValueNode(
          j,
          schemaFieldNullability
        );

        if (isFieldMethod) {
          const configArg = fieldCall.arguments[0];
          if (configArg?.type !== "ObjectExpression") {
            return;
          }

          upsertObjectProperty(j, configArg, "nullable", nullableValueNode);
          return;
        }

        if (!isExposeMethod) {
          if (!fieldCall.arguments[0]) {
            fieldCall.arguments[0] = j.objectExpression([]);
          }

          const helperOptionsArg = fieldCall.arguments[0];
          if (helperOptionsArg?.type !== "ObjectExpression") {
            return;
          }

          upsertObjectProperty(
            j,
            helperOptionsArg,
            "nullable",
            nullableValueNode
          );
          return;
        }

        if (!fieldCall.arguments[1]) {
          fieldCall.arguments[1] = j.objectExpression([]);
        }

        const optionsArg = fieldCall.arguments[1];
        if (optionsArg?.type !== "ObjectExpression") {
          return;
        }

        upsertObjectProperty(j, optionsArg, "nullable", nullableValueNode);
      });
    });

  root
    .find(j.CallExpression, {
      callee: {
        type: "MemberExpression",
        object: { type: "Identifier", name: "builder" },
        property: { type: "Identifier", name: "inputType" }
      }
    })
    .forEach(path => {
      const inputNameArg = path.value.arguments[0];
      const inputConfigArg = path.value.arguments[1];

      if (
        inputNameArg?.type !== "StringLiteral" ||
        inputConfigArg?.type !== "ObjectExpression"
      ) {
        return;
      }

      const typeFields = inputTypeSchemaMap.get(inputNameArg.value);
      if (!typeFields) {
        return;
      }

      const fieldsProperty = inputConfigArg.properties.find(
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

        const graphQLFieldName = getPropertyKeyName(fieldProperty);
        if (!graphQLFieldName) {
          return;
        }

        const schemaFieldNullability = typeFields.get(graphQLFieldName);
        if (!schemaFieldNullability) {
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
          fieldCallee.property?.type !== "Identifier"
        ) {
          return;
        }

        const methodName = fieldCallee.property.name;
        const alignedMethodName = getAlignedInputHelperMethodName(
          methodName,
          schemaFieldNullability
        );

        if (alignedMethodName !== methodName) {
          fieldCallee.property = j.identifier(alignedMethodName);
        }

        const requiredValueNode = createRequiredValueNode(
          j,
          schemaFieldNullability
        );

        if (alignedMethodName === "field") {
          const configArg = fieldCall.arguments[0];
          if (configArg?.type !== "ObjectExpression") {
            return;
          }

          upsertObjectProperty(j, configArg, "required", requiredValueNode);
          return;
        }

        if (!fieldCall.arguments[0]) {
          fieldCall.arguments[0] = j.objectExpression([]);
        }

        const optionsArg = fieldCall.arguments[0];
        if (optionsArg?.type !== "ObjectExpression") {
          return;
        }

        upsertObjectProperty(j, optionsArg, "required", requiredValueNode);
      });
    });

  return root.toSource();
};

export default transform;
