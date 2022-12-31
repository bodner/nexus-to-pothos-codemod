import {JSCodeshift, Transform} from "jscodeshift/src/core";

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

const nullableObject = (nullable: boolean, j: JSCodeshift) => j.objectExpression([
  j.property('init', j.identifier('nullable'), j.booleanLiteral(nullable))
])

const transform: Transform = (file, api) => {
  const j = api.jscodeshift;
  const {statement} = j.template;
  const root = j(file.source);
  const objects = root
    .find(j.CallExpression).filter(p => {
      const callee = p.value.callee;
      return callee.type === 'Identifier' && callee.name === 'objectType';
    });
  const enums = root
    .find(j.CallExpression).filter(p => {
      const callee = p.value.callee;
      return callee.type === 'Identifier' && callee.name === 'enumType';
    });
  const queriesMutations = root
    .find(j.CallExpression).filter(p => {
      const callee = p.value.callee;
      const functionNames = ['mutationField', 'queryField'];
      return callee.type === 'Identifier' && functionNames.includes(callee.name) && p.value.arguments[0].type === 'StringLiteral';
    });
  const relayQueries = root
    .find(j.CallExpression).filter(p => {
      const callee = p.value.callee;
      const functionNames = ['mutationField', 'queryField'];
      // matches arrow functions
      return callee.type === 'Identifier' && functionNames.includes(callee.name) && p.value.arguments[0].type === 'ArrowFunctionExpression';
    });
  enums.replaceWith(p => {
    const name = p.value.arguments[0].properties.find((p: any) => p.key.name === 'name').value;
    return statement`builder.enumType(${name}, {
  values: ${p.value.arguments[0].properties.find((p: any) => p.key.name === 'members').value} as const
})`;
  })
  queriesMutations.replaceWith(p => {
    const functionName = p.value.callee.name;
    const args = p.value.arguments;
    if (args.length === 0) {
      return p.value;
    }
    const name = args[0].value;
    const config = args[1];
    const auth = config.properties.find(p => p.key.name === 'authorize');
    if (auth) {
      auth.key.name = "authScopes";
    }
    const newArgs = config.properties.find(p => p.key.name === 'args');
    if (newArgs) {
      newArgs.value.properties = newArgs.value.properties.map(p => {
        const name = p.key.name;
        const nonNullable = p.value.callee.name === 'nonNull';
        const params = []
        if (nonNullable) {
          params.push(j.property('init', j.identifier('required'), j.booleanLiteral(true)))
        }
        const val = p.value.arguments[0] ?? p.value;
        let newArg;
        if (val.type === 'Identifier') {
          params.unshift(j.property('init', j.identifier('type'), val))
          newArg = j.callExpression(
            j.memberExpression(j.identifier('t'), j.identifier('arg')),
            [j.objectExpression(params)]
          );
        } else {
          const type = val.callee.name.match(/[a-z]+/g)[0];
          newArg = j.callExpression(
            j.memberExpression(j.memberExpression(j.identifier('t'), j.identifier('arg')), j.identifier(type)),
            params.length ? [j.objectExpression(params)] : []
          );
        }
        return j.property('init', j.identifier(name), newArg);
      });
    }
    const typeProperty = config.properties.find(p => p.key.name === 'type')
    const isNullable = typeProperty.value.type === 'CallExpression' && typeProperty.value.callee.name === 'nullable'
    if (isNullable) {
      if (typeProperty.value.arguments[0]?.callee?.name === 'list') {
        typeProperty.value = j.arrayExpression([typeProperty.value.arguments[0].arguments[0]]);
      } else {
        typeProperty.value = typeProperty.value.arguments[0];
      }
    } else if (typeProperty.value.type === 'CallExpression' && typeProperty.value.callee.name === 'list') {
      typeProperty.value = j.arrayExpression([typeProperty.value.arguments[0]]);
    }
    return statement`builder.${functionName}(${j.stringLiteral(name)}, t => t.field(${j.objectExpression([
      typeProperty,
      isNullable ? j.property('init', j.identifier('nullable'), j.booleanLiteral(true)) : null,
      config.properties.find(p => p.key.name === 'args'),
      auth,
      config.properties.find(p => p.key.name === 'resolve')].filter(Boolean))}))`;
  });

  relayQueries.replaceWith(p => {
    const functionName = p.value.callee.name;
    const args = p.value.arguments;
    if (args.length === 0) {
      return p.value;
    }
    const connectionFieldArguments = args[0].body.body[0].expression.arguments;
    const name = connectionFieldArguments[0].value;
    const config = connectionFieldArguments[1];
    const typeProperty = config.properties.find(p => p.key.name === 'type');
    const isNullable = typeProperty.value.type === 'CallExpression' && typeProperty.value.callee.name === 'nullable';
    if (isNullable) {
      typeProperty.value = typeProperty.value.arguments[0];
    }
    const additionalArgs = config.properties.find(p => p.key.name === 'additionalArgs');
    if (additionalArgs) {
      additionalArgs.key.name = 'args';
    }
    const nodes = config.properties.find(p => p.key.name === 'nodes');
    if (nodes) {
      nodes.key.name = 'resolve';
      const previousBody = nodes.body;
      const isAsync = nodes.async;
      nodes.async = false;
      nodes.body = j.blockStatement([
        j.returnStatement(
          j.callExpression(
            j.identifier('resolveOffsetConnection'),
            [
              j.objectExpression([
                j.property.from({
                  kind: 'init',
                  key: j.identifier('args'),
                  value: j.identifier('args'),
                  shorthand: true
                })
              ]),
              j.arrowFunctionExpression.from({
                  params: [
                    j.objectPattern([
                      j.property.from({
                        kind: 'init',
                        key: j.identifier('limit'),
                        value: j.identifier('limit'),
                        shorthand: true
                      }),
                      j.property.from({
                        kind: 'init',
                        key: j.identifier('offset'),
                        value: j.identifier('offset'),
                        shorthand: true
                      })
                    ])
                  ],
                  body: previousBody,
                  async: isAsync
                }
              )
            ]
          )
        )
      ]);
    }
    return statement`builder.${functionName}(${j.stringLiteral(name)}, t => t.connection(${j.objectExpression([
      typeProperty,
      isNullable ? j.property('init', j.identifier('nullable'), j.booleanLiteral(true)) : null,
      additionalArgs,
      nodes].filter(Boolean))}))`;
  });

  objects.replaceWith(p => {
    const object = p.value.arguments[0];
    const type = object.properties.find(p => p.key.name === 'name').value;
    const definitions = object.properties.find(p => p.key.name === 'definition').body.body;
    const fields = definitions.map(node => {
      const functionName = node.expression.callee.property.name;
      const isNullable = node.expression.callee.object.property?.name === 'nullable'
      let propertyName;
      let type;
      let resolve;
      if (functionName === 'field' && node.expression.arguments[0].type === 'ObjectExpression') {
        propertyName = node.expression.arguments[0].properties.find(p => p.key.name === 'name').value;
        type = node.expression.arguments[0].properties.find(p => p.key.name === 'type').value;
        resolve = node.expression.arguments[0].properties.find(p => p.key.name === 'resolve');
      } else if (functionName === 'field') {
        propertyName = node.expression.arguments[0];
        type = node.expression.arguments[1].properties.find(p => p.key.name === 'type').value;
        resolve = node.expression.arguments[1].properties.find(p => p.key.name === 'resolve')
      } else {
        propertyName = node.expression.arguments[0];
        type = functionName;
        resolve = node.expression.arguments[1]?.properties.find(p => p.key.name === 'resolve')
      }
      const exposeName = functionName === 'field' ? 'expose' : `expose${capitalizeFirstLetter(type === 'id' ? 'ID' : type)}`;
      const objectProps = [];
      if (functionName === 'field') {
        objectProps.push(j.property('init', j.identifier('type'), type))
      }
      if (isNullable) {
        objectProps.push(j.property('init', j.identifier('nullable'), j.booleanLiteral(true)))
      }
      if (resolve) {
        objectProps.push(resolve)
      }
      return j.property('init', j.identifier(propertyName.value), j.callExpression(
        j.memberExpression(j.identifier('t'), j.identifier(exposeName)),
        objectProps.length ? [propertyName, j.objectExpression(objectProps)] : [propertyName]
      ));
    })
    return statement`builder.objectRef<any>(${type})
  .implement({
    fields: (t) => ${j.objectExpression(fields)}
  })`;
  });
  return root.toSource();
};

export default transform;