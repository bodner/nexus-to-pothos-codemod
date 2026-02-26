import { Transform } from "jscodeshift/src/core";

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function getMemberChain(callee) {
  const chain = [];
  let current = callee;
  while (current) {
    if (current.type === "MemberExpression") {
      if (current.property?.type === "Identifier") {
        chain.unshift(current.property.name);
      }
      current = current.object;
      continue;
    }
    if (current.type === "Identifier") {
      chain.unshift(current.name);
    }
    break;
  }
  return chain;
}

function isValidTypeIdentifier(name: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

const transform: Transform = (file, api) => {
  const j = api.jscodeshift;
  const { statement } = j.template;
  const root = j(file.source);

  const upsertNamedImport = (source: string, importNames: string[]) => {
    if (!importNames.length) {
      return;
    }

    const programBody = root.get().node.program.body;
    const sourceImport = root
      .find(j.ImportDeclaration)
      .filter(path => path.value.source?.value === source)
      .at(0)
      .nodes()[0];

    if (sourceImport) {
      sourceImport.specifiers = sourceImport.specifiers || [];
      const existingImportedNames = new Set(
        sourceImport.specifiers
          .filter(s => s.type === "ImportSpecifier")
          .map(s => s.imported?.type === "Identifier" ? s.imported.name : "")
          .filter(Boolean)
      );

      importNames.forEach(importName => {
        if (!existingImportedNames.has(importName)) {
          sourceImport.specifiers.push(
            j.importSpecifier(j.identifier(importName))
          );
        }
      });
      return;
    }

    const newImport = j.importDeclaration(
      importNames.map(importName => j.importSpecifier(j.identifier(importName))),
      j.stringLiteral(source)
    );

    const lastImportIndex = programBody.reduce((lastIndex, node, index) => {
      return node.type === "ImportDeclaration" ? index : lastIndex;
    }, -1);

    if (lastImportIndex >= 0) {
      programBody.splice(lastImportIndex + 1, 0, newImport);
    } else {
      programBody.unshift(newImport);
    }
  };

  const hasLocalImportBinding = (localName: string) => {
    return (
      root
        .find(j.ImportDeclaration)
        .filter(path =>
          path.value.specifiers?.some(specifier => specifier.local?.name === localName)
        )
        .size() > 0
    );
  };

  const objectRefTypeImportNames = new Set<string>();

  const transformArgProperty = p => {
    const argName = p.key.name;
    const isNonNullWrapper =
      p.value?.type === "CallExpression" && p.value.callee?.name === "nonNull";
    const isNullableWrapper =
      p.value?.type === "CallExpression" && p.value.callee?.name === "nullable";
    const params = [];
    if (isNonNullWrapper) {
      params.push(
        j.property("init", j.identifier("required"), j.booleanLiteral(true))
      );
    }
    if (isNullableWrapper) {
      params.push(
        j.property("init", j.identifier("required"), j.booleanLiteral(false))
      );
    }
    const val =
      (isNonNullWrapper || isNullableWrapper) && p.value.arguments?.length
        ? p.value.arguments[0]
        : p.value;
    let newArg;
    if (val?.type === "Identifier") {
      params.unshift(j.property("init", j.identifier("type"), val));
      newArg = j.callExpression(
        j.memberExpression(j.identifier("t"), j.identifier("arg")),
        [j.objectExpression(params)]
      );
    } else if (val?.type === "ExpressionStatement") {
      params.unshift(j.property("init", j.identifier("type"), val.expression));
      newArg = j.callExpression(
        j.memberExpression(j.identifier("t"), j.identifier("arg")),
        [j.objectExpression(params)]
      );
    } else if (
      val?.type === "CallExpression" &&
      val.callee?.type === "Identifier"
    ) {
      const type = val.callee.name.match(/[a-z]+/g)?.[0];
      if (type) {
        newArg = j.callExpression(
          j.memberExpression(
            j.memberExpression(j.identifier("t"), j.identifier("arg")),
            j.identifier(type)
          ),
          params.length ? [j.objectExpression(params)] : []
        );
      } else {
        params.unshift(j.property("init", j.identifier("type"), val));
        newArg = j.callExpression(
          j.memberExpression(j.identifier("t"), j.identifier("arg")),
          [j.objectExpression(params)]
        );
      }
    } else {
      params.unshift(j.property("init", j.identifier("type"), val));
      newArg = j.callExpression(
        j.memberExpression(j.identifier("t"), j.identifier("arg")),
        [j.objectExpression(params)]
      );
    }
    return j.property("init", j.identifier(argName), newArg);
  };

  const upsertObjectProperty = (properties, keyName, valueNode) => {
    const nextProperty = j.property("init", j.identifier(keyName), valueNode);
    const index = properties.findIndex(
      property => property.key?.name === keyName
    );
    if (index >= 0) {
      properties[index] = nextProperty;
    } else {
      properties.push(nextProperty);
    }
  };

  const unwrapTypeNullability = typeNode => {
    let type = typeNode;
    let explicitNullable: boolean | null = null;

    while (
      type?.type === "CallExpression" &&
      type.callee?.type === "Identifier" &&
      ["nonNull", "nullable"].includes(type.callee.name) &&
      type.arguments?.length
    ) {
      if (explicitNullable === null) {
        explicitNullable = type.callee.name === "nullable";
      }
      type = type.arguments[0];
    }

    return {
      type,
      explicitNullable
    };
  };

  const normalizeFieldType = (typeNode, hasListWrapper) => {
    const unwrappedType = unwrapTypeNullability(typeNode);
    let type = unwrappedType.type;
    let required: boolean | null = null;
    let hasList = hasListWrapper;

    if (type?.type === "CallExpression" && type.callee?.name === "list") {
      hasList = true;
      let listItemType = type.arguments[0];
      if (
        listItemType?.type === "CallExpression" &&
        ["nonNull", "nullable"].includes(listItemType.callee?.name)
      ) {
        required = listItemType.callee.name === "nonNull";
        listItemType = listItemType.arguments[0];
      }
      type = j.arrayExpression([listItemType]);
    } else if (hasListWrapper) {
      type = j.arrayExpression([type]);
    }

    return {
      type,
      hasList,
      required,
      explicitNullable: unwrappedType.explicitNullable
    };
  };

  const transformRootFieldCall = call => {
    if (call.callee.type !== "MemberExpression") {
      return null;
    }

    const methodChain = getMemberChain(call.callee);
    const method = methodChain[methodChain.length - 1];
    const wrappers = methodChain.slice(1, -1);
    const listIndex = wrappers.indexOf("list");
    const outerWrappers =
      listIndex >= 0 ? wrappers.slice(0, listIndex) : wrappers;
    const innerWrappers = listIndex >= 0 ? wrappers.slice(listIndex + 1) : [];

    const hasListWrapper = listIndex >= 0;
    const hasOuterNonNull = outerWrappers.includes("nonNull");
    const hasOuterNullable = outerWrappers.includes("nullable");
    const explicitNullable = hasOuterNonNull
      ? false
      : hasOuterNullable
        ? true
        : null;
    const wrapperRequired = innerWrappers.includes("nonNull")
      ? true
      : innerWrappers.includes("nullable")
        ? false
        : null;

    const fieldNameArg = call.arguments[0];
    if (fieldNameArg?.type !== "StringLiteral") {
      return null;
    }

    const fieldName = fieldNameArg.value;
    const configArg = call.arguments[1];
    const configProps =
      configArg?.type === "ObjectExpression" ? [...configArg.properties] : [];

    const argsProperty = configProps.find(
      property => property.key?.name === "args"
    );
    if (argsProperty?.value?.type === "ObjectExpression") {
      argsProperty.value.properties =
        argsProperty.value.properties.map(transformArgProperty);
    }

    const authorizeProperty = configProps.find(
      property => property.key?.name === "authorize"
    );
    if (authorizeProperty) {
      authorizeProperty.key.name = "authScopes";
    }

    if (method === "field") {
      const typeProperty = configProps.find(
        property => property.key?.name === "type"
      );
      if (!typeProperty) {
        return null;
      }

      const normalizedType = normalizeFieldType(
        typeProperty.value,
        hasListWrapper
      );
      typeProperty.value = normalizedType.type;

      const effectiveNullable =
        explicitNullable ?? normalizedType.explicitNullable;

      const resolveProperty = configProps.find(
        property => property.key?.name === "resolve"
      );
      const authScopesProperty = configProps.find(
        property => property.key?.name === "authScopes"
      );

      const shouldSetRequired = normalizedType.hasList;
      const requiredValue =
        wrapperRequired ??
        normalizedType.required ??
        (shouldSetRequired ? false : null);
      const requiredProperty =
        typeof requiredValue === "boolean"
          ? j.property(
              "init",
              j.identifier("required"),
              j.booleanLiteral(requiredValue)
            )
          : null;

      const shouldSetNullable =
        effectiveNullable !== null ||
        normalizedType.hasList ||
        normalizedType.required !== null;
      const nullableProperty = shouldSetNullable
        ? j.property(
            "init",
            j.identifier("nullable"),
            j.booleanLiteral(effectiveNullable ?? true)
          )
        : null;

      const extraProperties = configProps.filter(
        property =>
          ![
            "type",
            "nullable",
            "required",
            "args",
            "authorize",
            "authScopes",
            "resolve"
          ].includes(property.key?.name)
      );

      const fieldConfigProperties = [
        typeProperty,
        nullableProperty,
        requiredProperty,
        argsProperty,
        authScopesProperty,
        ...extraProperties,
        resolveProperty
      ].filter(Boolean);

      return j.property(
        "init",
        j.identifier(fieldName),
        j.callExpression(
          j.memberExpression(j.identifier("t"), j.identifier("field")),
          [j.objectExpression(fieldConfigProperties)]
        )
      );
    }

    const transformedMethod = hasListWrapper ? `${method}List` : method;
    const resolveProperty = configProps.find(
      property => property.key?.name === "resolve"
    );
    const authScopesProperty = configProps.find(
      property => property.key?.name === "authScopes"
    );

    const requiredValue = hasListWrapper ? (wrapperRequired ?? false) : null;
    const requiredProperty =
      typeof requiredValue === "boolean"
        ? j.property(
            "init",
            j.identifier("required"),
            j.booleanLiteral(requiredValue)
          )
        : null;

    const nullableValue = hasListWrapper
      ? (explicitNullable ?? true)
      : explicitNullable !== null
        ? explicitNullable
        : null;
    const nullableProperty =
      typeof nullableValue === "boolean"
        ? j.property(
            "init",
            j.identifier("nullable"),
            j.booleanLiteral(nullableValue)
          )
        : null;

    const extraProperties = configProps.filter(
      property =>
        ![
          "nullable",
          "required",
          "args",
          "authorize",
          "authScopes",
          "resolve"
        ].includes(property.key?.name)
    );

    const methodConfigProps = [
      nullableProperty,
      requiredProperty,
      argsProperty,
      authScopesProperty,
      ...extraProperties,
      resolveProperty
    ].filter(Boolean);

    const methodArguments = methodConfigProps.length
      ? [j.objectExpression(methodConfigProps)]
      : [];

    return j.property(
      "init",
      j.identifier(fieldName),
      j.callExpression(
        j.memberExpression(j.identifier("t"), j.identifier(transformedMethod)),
        methodArguments
      )
    );
  };

  const objectTypes = ["objectType", "interfaceType", "inputObjectType"];
  const objects = root.find(j.CallExpression, {
    callee: {
      type: "Identifier",
      name: (name: string) => objectTypes.includes(name)
    }
  });

  const enums = root.find(j.CallExpression, {
    callee: {
      type: "Identifier",
      name: "enumType"
    }
  });

  const queriesMutations = root.find(j.CallExpression).filter(p => {
    const callee = p.value.callee;
    const functionNames = ["mutationField", "queryField"];
    return (
      callee.type === "Identifier" &&
      functionNames.includes(callee.name) &&
      p.value.arguments[0].type === "StringLiteral"
    );
  });
  const relayQueries = root.find(j.CallExpression).filter(p => {
    const callee = p.value.callee;
    const functionNames = ["mutationField", "queryField"];
    // matches arrow functions
    return (
      callee.type === "Identifier" &&
      functionNames.includes(callee.name) &&
      p.value.arguments[0].type === "ArrowFunctionExpression"
    );
  });
  enums.replaceWith(p => {
    const callExpression = p.value;
    const firstArgument = callExpression.arguments[0];

    if (firstArgument?.type !== "ObjectExpression") {
      console.warn(
        "Expected ObjectExpression as the first argument of enumType"
      );
      return p.value;
    }

    const name = j(firstArgument)
      .find(j.ObjectProperty, {
        key: { type: "Identifier", name: "name" }
      })
      .nodes()[0].value;

    const members = j(firstArgument)
      .find(j.ObjectProperty, {
        key: { type: "Identifier", name: "members" }
      })
      .nodes()[0].value;

    return statement`builder.enumType(${name}, {
  values: ${members} as const
})`;
  });
  queriesMutations.replaceWith(p => {
    const functionName = p.value.callee.name;
    const args = p.value.arguments;
    if (args.length === 0) {
      return p.value;
    }
    const name = args[0].value;
    const config = args[1];
    const auth = config.properties.find(p => p.key.name === "authorize");
    if (auth) {
      auth.key.name = "authScopes";
    }
    const newArgs = config.properties.find(p => p.key.name === "args");
    if (newArgs) {
      newArgs.value.properties =
        newArgs.value.properties.map(transformArgProperty);
    }
    const typeProperty = config.properties.find(p => p.key.name === "type");
    const normalizedType = unwrapTypeNullability(typeProperty.value);
    typeProperty.value = normalizedType.type;
    const isNullable = normalizedType.explicitNullable === true;
    if (
      typeProperty.value.type === "CallExpression" &&
      typeProperty.value.callee.name === "list"
    ) {
      typeProperty.value = j.arrayExpression([typeProperty.value.arguments[0]]);
    }
    return statement`builder.${functionName}(${j.stringLiteral(name)}, t => t.field(${j.objectExpression(
      [
        typeProperty,
        isNullable
          ? j.property("init", j.identifier("nullable"), j.booleanLiteral(true))
          : null,
        config.properties.find(p => p.key.name === "args"),
        auth,
        config.properties.find(p => p.key.name === "resolve")
      ].filter(Boolean)
    )}))`;
  });

  relayQueries.replaceWith(p => {
    const functionName = p.value.callee.name;
    const args = p.value.arguments;
    if (args.length === 0 || args[0]?.type !== "ArrowFunctionExpression") {
      return p.value;
    }
    const arrowBody = args[0].body;
    const calls =
      arrowBody.type === "BlockStatement"
        ? arrowBody.body
            .filter(s => s.type === "ExpressionStatement")
            .map(s => s.expression)
            .filter(e => e.type === "CallExpression")
        : arrowBody.type === "CallExpression"
          ? [arrowBody]
          : [];

    if (!calls.length) {
      return p.value;
    }

    const memberNames = calls
      .map(call =>
        call.callee.type === "MemberExpression" &&
        call.callee.property.type === "Identifier"
          ? call.callee.property.name
          : null
      )
      .filter(Boolean);

    const isConnectionFieldShape = memberNames.every(
      name => name === "connectionField"
    );
    const supportedRootMethods = [
      "field",
      "boolean",
      "int",
      "string",
      "id",
      "float"
    ];

    const isSupportedRootShape = memberNames.every(name =>
      supportedRootMethods.includes(name)
    );

    if (isSupportedRootShape) {
      const transformedFields = calls.map(transformRootFieldCall);

      if (transformedFields.some(field => !field)) {
        return p.value;
      }

      if (!transformedFields.length) {
        return p.value;
      }

      const rootTypeName =
        functionName === "queryField" ? "queryType" : "mutationType";
      return j.callExpression(
        j.memberExpression(j.identifier("builder"), j.identifier(rootTypeName)),
        [
          j.objectExpression([
            j.property(
              "init",
              j.identifier("fields"),
              j.arrowFunctionExpression(
                [j.identifier("t")],
                j.objectExpression(transformedFields)
              )
            )
          ])
        ]
      );
    }

    if (!isConnectionFieldShape) {
      return p.value;
    }

    const connectionCall = calls[0];
    const connectionFieldArguments = connectionCall.arguments;
    if (
      connectionFieldArguments.length < 2 ||
      connectionFieldArguments[0]?.type !== "StringLiteral" ||
      connectionFieldArguments[1]?.type !== "ObjectExpression"
    ) {
      return p.value;
    }
    const name = connectionFieldArguments[0].value;
    const config = connectionFieldArguments[1];
    const typeProperty = config.properties.find(p => p.key.name === "type");
    if (!typeProperty) {
      return p.value;
    }
    const normalizedConnectionType = unwrapTypeNullability(typeProperty.value);
    typeProperty.value = normalizedConnectionType.type;
    const isNullable = normalizedConnectionType.explicitNullable === true;
    if (
      typeProperty.value.type === "CallExpression" &&
      typeProperty.value.callee.name === "list"
    ) {
      typeProperty.value = j.arrayExpression([typeProperty.value.arguments[0]]);
    }
    const additionalArgs = config.properties.find(
      p => p.key.name === "additionalArgs"
    );
    if (additionalArgs) {
      additionalArgs.key.name = "args";
    }
    const nodes = config.properties.find(p => p.key.name === "nodes");
    if (nodes) {
      nodes.key.name = "resolve";
      const previousBody = nodes.body;
      const isAsync = nodes.async;
      nodes.async = false;
      nodes.body = j.blockStatement([
        j.returnStatement(
          j.callExpression(j.identifier("resolveOffsetConnection"), [
            j.objectExpression([
              j.property.from({
                kind: "init",
                key: j.identifier("args"),
                value: j.identifier("args"),
                shorthand: true
              })
            ]),
            j.arrowFunctionExpression.from({
              params: [
                j.objectPattern([
                  j.property.from({
                    kind: "init",
                    key: j.identifier("limit"),
                    value: j.identifier("limit"),
                    shorthand: true
                  }),
                  j.property.from({
                    kind: "init",
                    key: j.identifier("offset"),
                    value: j.identifier("offset"),
                    shorthand: true
                  })
                ])
              ],
              body: previousBody,
              async: isAsync
            })
          ])
        )
      ]);
    }
    const auth = config.properties.find(p => p.key.name === "authorize");
    if (auth) {
      auth.key.name = "authScopes";
    }
    return statement`builder.${functionName}(${j.stringLiteral(name)}, t => t.connection(${j.objectExpression(
      [
        typeProperty,
        isNullable
          ? j.property("init", j.identifier("nullable"), j.booleanLiteral(true))
          : null,
        additionalArgs,
        auth ? auth : null,
        nodes
      ].filter(Boolean)
    )}))`;
  });

  objects.replaceWith(p => {
    const object = p.value.arguments[0];
    const type = object.properties.find(p => p.key.name === "name").value;
    const definitions = object.properties.find(p => p.key.name === "definition")
      .body.body;
    const resolveType = object.properties.find(
      p => p.key.name === "resolveType"
    );
    let objectType = "objectRef";
    if (p.node.callee.name === "interfaceType") {
      objectType = "interfaceRef";
    } else if (p.node.callee.name === "inputObjectType") {
      objectType = "inputType";
    }
    const implementsInterfaces = [];
    const fields = definitions
      .map((node, idx) => {
        try {
          const functionName = node.expression.callee.property.name;
          const memberChain = getMemberChain(node.expression.callee);
          const hasList = memberChain.includes("list");
          const hasNonNull = memberChain.includes("nonNull");
          const hasNullable = memberChain.includes("nullable");
          if (functionName === "implements") {
            implementsInterfaces.push(node.expression.arguments[0].name);
            return null;
          }
          const isNullable = hasList ? !hasNonNull : hasNullable;
          if (
            objectType === "interfaceRef" ||
            objectType === "inputType" ||
            (node.expression.arguments.length === 2 &&
              node.expression.callee.property.name !== "field")
          ) {
            let transformedFunctionName = node.expression.callee.property.name;
            if (hasList && transformedFunctionName !== "field") {
              transformedFunctionName = `${transformedFunctionName}List`;
            }
            const args = [];
            let name;
            if (functionName === "field") {
              const fieldArgument = node.expression.arguments[0];
              const fieldConfig = node.expression.arguments[1];
              let props = [];
              if (fieldArgument?.type === "ObjectExpression") {
                const nameProperty = fieldArgument.properties.find(
                  p => p.key?.name === "name"
                );
                if (!nameProperty) {
                  return node;
                }
                name = nameProperty.value.value;
                props = fieldArgument.properties.filter(
                  p => p.key?.name !== "name"
                );
              } else if (
                fieldConfig?.type === "ObjectExpression" &&
                fieldArgument?.type === "StringLiteral"
              ) {
                name = fieldArgument.value;
                props = [...fieldConfig.properties];
              } else {
                return node;
              }
              if (isNullable) {
                props.unshift(
                  j.property(
                    "init",
                    j.identifier("nullable"),
                    j.booleanLiteral(true)
                  )
                );
              }
              args.push(j.objectExpression(props));
            } else if (
              node.expression.arguments[1]?.type === "ObjectExpression"
            ) {
              name = node.expression.arguments[0].value;
              const props = [...node.expression.arguments[1].properties];
              if (isNullable) {
                props.unshift(
                  j.property(
                    "init",
                    j.identifier("nullable"),
                    j.booleanLiteral(true)
                  )
                );
              }
              if (hasList) {
                props.unshift(
                  j.property(
                    "init",
                    j.identifier("required"),
                    j.booleanLiteral(false)
                  )
                );
                if (!isNullable) {
                  props.unshift(
                    j.property(
                      "init",
                      j.identifier("nullable"),
                      j.booleanLiteral(false)
                    )
                  );
                }
              }
              args.push(j.objectExpression(props));
            } else {
              name = node.expression.arguments[0].value;
            }
            return j.property(
              "init",
              j.identifier(name),
              j.callExpression(
                j.memberExpression(
                  j.identifier("t"),
                  j.identifier(transformedFunctionName)
                ),
                args
              )
            );
          }

          let propertyName;
          let type;
          let resolve;
          if (
            functionName === "field" &&
            node.expression.arguments[0].type === "ObjectExpression"
          ) {
            propertyName = node.expression.arguments[0].properties.find(
              p => p.key.name === "name"
            ).value;
            type = node.expression.arguments[0].properties.find(
              p => p.key.name === "type"
            ).value;
            resolve = node.expression.arguments[0].properties.find(
              p => p.key.name === "resolve"
            );
          } else if (functionName === "field") {
            if (node.expression.arguments[1]?.type !== "ObjectExpression") {
              return node;
            }
            propertyName = node.expression.arguments[0];
            const typeProperty = node.expression.arguments[1].properties.find(
              p => p.key.name === "type"
            );
            if (!typeProperty) {
              return node;
            }
            type = typeProperty.value;
            resolve = node.expression.arguments[1].properties.find(
              p => p.key.name === "resolve"
            );
          } else {
            propertyName = node.expression.arguments[0];
            type = functionName;
            resolve = node.expression.arguments[1]?.properties.find(
              p => p.key.name === "resolve"
            );
          }
          let exposeName;
          const functionArguments = [];
          if (functionName === "field") {
            if (resolve) {
              exposeName = "field";
            } else {
              exposeName = "expose";
              functionArguments.push(propertyName);
            }
          } else {
            exposeName = `expose${capitalizeFirstLetter(type === "id" ? "ID" : type)}`;
            functionArguments.push(propertyName);
          }
          const objectProps = [];
          let hasListTypeWrapper = false;
          let listItemRequired: boolean | null = null;
          let explicitTypeNullable: boolean | null = null;
          if (functionName === "field") {
            const normalizedType = unwrapTypeNullability(type);
            let finalType = normalizedType.type;
            explicitTypeNullable = normalizedType.explicitNullable;
            if (
              hasList ||
              (finalType.type === "CallExpression" &&
                finalType.callee.name === "list")
            ) {
              hasListTypeWrapper =
                finalType.type === "CallExpression" &&
                finalType.callee.name === "list";
              let listType = hasListTypeWrapper
                ? finalType.arguments[0]
                : finalType;
              if (
                hasListTypeWrapper &&
                listType?.type === "CallExpression" &&
                ["nonNull", "nullable"].includes(listType.callee?.name)
              ) {
                listItemRequired = listType.callee.name === "nonNull";
                listType = listType.arguments[0];
              }
              finalType = j.arrayExpression([listType]);
            }
            objectProps.push(
              j.property("init", j.identifier("type"), finalType)
            );
            if (hasList) {
              objectProps.push(
                j.property(
                  "init",
                  j.identifier("required"),
                  j.booleanLiteral(false)
                )
              );
              objectProps.push(
                j.property(
                  "init",
                  j.identifier("nullable"),
                  j.booleanLiteral(!hasNonNull)
                )
              );
            } else if (hasListTypeWrapper) {
              if (typeof listItemRequired === "boolean") {
                objectProps.push(
                  j.property(
                    "init",
                    j.identifier("required"),
                    j.booleanLiteral(listItemRequired)
                  )
                );
              }
              const listNullableValue =
                explicitTypeNullable ??
                (hasNonNull ? false : hasNullable ? true : true);
              if (
                explicitTypeNullable !== null ||
                typeof listItemRequired === "boolean"
              ) {
                objectProps.push(
                  j.property(
                    "init",
                    j.identifier("nullable"),
                    j.booleanLiteral(listNullableValue)
                  )
                );
              }
            }
          }
          if (
            (isNullable || explicitTypeNullable) &&
            !hasList &&
            !hasListTypeWrapper
          ) {
            objectProps.push(
              j.property(
                "init",
                j.identifier("nullable"),
                j.booleanLiteral(true)
              )
            );
          }
          if (resolve) {
            objectProps.push(resolve);
          }
          if (objectProps.length) {
            functionArguments.push(j.objectExpression(objectProps));
          }
          return j.property(
            "init",
            j.identifier(propertyName.value),
            j.callExpression(
              j.memberExpression(j.identifier("t"), j.identifier(exposeName)),
              functionArguments
            )
          );
        } catch (err) {
          console.error(
            `[codemod] Failed in ${file.path} at definition index ${idx}`
          );
          console.error(`[codemod] Node source:\n${j(node).toSource()}`);
          console.error(
            `[codemod] args length: ${node?.expression?.arguments?.length ?? "n/a"}`
          );
          throw err;
        }
      })
      .filter(Boolean);
    const objectProps = [];
    if (implementsInterfaces.length) {
      objectProps.push(
        j.property(
          "init",
          j.identifier("interfaces"),
          j.arrayExpression(implementsInterfaces.map(i => j.identifier(i)))
        )
      );
    }
    if (fields.length) {
      objectProps.push(
        j.property(
          "init",
          j.identifier("fields"),
          j.arrowFunctionExpression(
            [j.identifier("t")],
            j.objectExpression(fields)
          )
        )
      );
    }
    if (resolveType) {
      objectProps.push(resolveType);
    }
    if (objectType === "inputType") {
      return statement`builder.${objectType}(${type}, ${j.objectExpression(objectProps)})`;
    }
    const refStatement = statement`builder.${objectType}<any>(${type})
  .implement(${j.objectExpression(objectProps)})`;
    if (type.type === "StringLiteral" && isValidTypeIdentifier(type.value)) {
      const implementCall = refStatement.expression;
      if (
        implementCall?.type === "CallExpression" &&
        implementCall.callee.type === "MemberExpression" &&
        implementCall.callee.object.type === "CallExpression" &&
        implementCall.callee.object.typeParameters?.type ===
          "TSTypeParameterInstantiation"
      ) {
        implementCall.callee.object.typeParameters.params = [
          j.tsTypeReference(j.identifier(type.value))
        ];
        if (objectType === "objectRef") {
          objectRefTypeImportNames.add(type.value);
        }
      }
    }
    return refStatement;
  });

  const usesBuilder =
    root.find(j.MemberExpression, {
      object: { type: "Identifier", name: "builder" }
    }).size() > 0;
  if (usesBuilder && !hasLocalImportBinding("builder")) {
    upsertNamedImport("#/schema/builder.js", ["builder"]);
  }

  const objectRefTypeImports = new Set<string>(objectRefTypeImportNames);
  root
    .find(j.CallExpression, {
      callee: {
        type: "MemberExpression",
        object: { type: "Identifier", name: "builder" },
        property: { type: "Identifier", name: "objectRef" }
      }
    })
    .forEach(path => {
      const typeParams = path.value.typeParameters || path.value.typeArguments;
      if (!typeParams || typeParams.type !== "TSTypeParameterInstantiation") {
        return;
      }

      typeParams.params.forEach(param => {
        if (
          param.type === "TSTypeReference" &&
          param.typeName.type === "Identifier"
        ) {
          objectRefTypeImports.add(param.typeName.name);
        }
      });
    });

  if (objectRefTypeImports.size > 0) {
    upsertNamedImport("@prisma/client", [...objectRefTypeImports].sort());
  }

  return root.toSource();
};

export default transform;
