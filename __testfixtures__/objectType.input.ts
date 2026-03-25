import { objectType, interfaceType, inputObjectType, nonNull, nullable, list } from 'nexus';

export const SomeObjectType = objectType({
  name: 'SomeObjectType',
  definition(t) {
    t.implements(SomeType1);
    t.id('a');
    t.float('b');
    t.nullable.float('c');
    t.nullable.field('d', {
      type: SomeEnum
    });
    t.nullable.string('e', {
      resolve(value: any) {
        return value.doSmthng();
      }
    });
    t.field({
      name: 'f',
      type: SomeType,
      async resolve(rootObject: any, args, ctx) {
        return ctx.smthng();
      }
    });
    t.float('g', {
      resolve: () => 1,
    });
    t.field('h', {
      type: list(Type),
      resolve: (somthng) => smthng.a()
    });
  }
});

export const Interface = interfaceType({
  name: 'SomeType1',
  definition(t) {
    t.id('id');
    t.string('stringField');
    t.field({
      name: 'resolvableField',
      type: SomeType2,
      async resolve(rootObject, args, ctx) {
        return 123;
      }
    });
  },
  resolveType(item) {
    return item.__typename;
  }
});

export const Input = inputObjectType({
  name: 'Input',
  definition(t) {
    t.string('a');
    t.int('b');
    t.int('c');
    t.int('d');
    t.nullable.id('legacyId', {
      deprecation: 'Use formVersionId field instead!',
    });
  }
});

export const RandomObjectType = objectType({
  name: 'RandomObjectType',
  definition(t) {
    t.nullable.list.boolean('listOfNullableBooleans', {
      resolve: () => [true, null, false]
    });
    t.nonNull.list.nullable.string('nonNullListOfNullableStrings', {
      resolve: () => ['a', null, 'b']
    });
    t.nonNull.list.field('nonNullListOfNullableObjects', {
      type: SomeRandomType,
      resolve: () => [new SomeRandomType(), new SomeRandomType()]
    });
  }
});

export const ListObjectType = objectType({
  name: 'ListObjectType',
  definition(t) {
    t.field('departments', {
      type: list(nonNull(GraphQLDepartment)),
      resolve: () => {
        return [
          { id: '1', name: 'HR' },
          { id: '2', name: 'Engineering' }
        ];
      }
    });
    t.nonNull.field('divisions', {
      type: list(nonNull(GraphQLDivision)),
      resolve: () => {
        return [
          { id: '1', name: 'Sales' },
          { id: '2', name: 'Marketing' }
        ];
      }
    });
    t.nullable.field('companies', {
      type: list(nullable(GraphQLCompany)),
      resolve: () => {
        return [
          { id: '1', name: 'Company1' },
          { id: '2', name: 'Company2' }
        ];
      }
    });
}});

export const InputWithField = inputObjectType({
  name: 'InputWithField',
  definition(t) {
    t.field('departments', {
      type: list(nonNull(GraphQLEmployeeDepartmentOptionalInput))
    });

    t.nonNull.list.nonNull.field('keywords', {
      type: GraphQLRecordKeywordInput,
      resolve: async (record) => null,
    })
  }
});

export const DeviceWithUser = objectType({
  name: 'DeviceWithUser',
  definition(t) {
    t.string('deviceId');

    t.field('user', {
      type: nonNull(GraphQLUser),
      resolve: (device) =>
        prisma.device
          .findUniqueOrThrow({
            where: {
              deviceId: device.deviceId,
            },
          })
          .user()
    });
  }
});

export const DeviceWithNullableUser = objectType({
  name: 'DeviceWithNullableUser',
  definition(t) {
    t.string('deviceId');

    t.field('user', {
      type: nullable(GraphQLUser),
      resolve: (device) =>
        prisma.device
          .findUniqueOrThrow({
            where: {
              deviceId: device.deviceId,
            },
          })
          .user()
    });

    t.nonNull.boolean('hasPrivilege', {
      args: {
        privilegeId: nonNull(stringArg()),
      },
      resolve: (user, {privilegeId}) => userHasPrivilege(user.id, privilegeId as PrivilegeId),
    })

    t.nullable.datetime('lastLogin', {
      resolve: (user) => user.lastLogin,
    })
    t.nullable.datetime('createdAt')
    t.nullable.timestamp('lastSeenAt')
    t.nonNull.date('birthday')
    t.nullable.json('metadata')
    t.nonNull.jsonObject('settings')

    t.nonNull.field('randomDate', {type: 'DateTime'})
    t.field('processedAt', {type: 'Timestamp'})
    t.nullable.field('nationalHoliday', {type: 'Date'})
    t.field('rawPayload', {type: 'JSON'})
    t.nullable.field('normalizedPayload', {type: 'JSONObject'})

  }
});

export const ObjTypeWithNonNullDefaults = objectType({
  name: 'ObjTypeWithNonNullDefaults',
  nonNullDefaults: {
    output: true,
  },
  definition(t) {
    t.nullable.list.boolean('x', {
      resolve: () => [true, null, false]
    });
    t.nonNull.list.nullable.string('y', {
      resolve: () => ['a', null, 'b']
    });
    t.list.field('z', {
      type: SomeRandomType,
      resolve: () => [new SomeRandomType(), new SomeRandomType()]
    });
    t.field('a', {
      type: XYZ,
      resolve: () => ({})
    })
  }
});

export const InputWithScalars = inputObjectType({
  name: 'InputWithScalars',
  definition(t) {
    t.string('deviceId');

    t.nonNull.boolean('hasPrivilege')

    t.nullable.datetime('createdAt')
    t.nullable.timestamp('lastSeenAt')
    t.nonNull.date('birthday')
    t.nullable.json('metadata')
    t.nonNull.jsonObject('settings')

    t.nonNull.field('randomDate', {type: 'DateTime'})
    t.field('processedAt', {type: 'Timestamp'})
    t.nullable.field('nationalHoliday', {type: 'Date'})
    t.field('rawPayload', {type: 'JSON'})
    t.nullable.field('normalizedPayload', {type: 'JSONObject'})
  }
});

export const InputWithDefaults = inputObjectType({
  name: 'InputWithDefaults',
  nonNullDefaults: {
    input: true,
  },
  definition(t) {
    t.string('a');

    t.datetime('b')
    t.nonNull.datetime('c')
    t.nullable.datetime('d')
    t.nullable.timestamp('e')

    t.list.nonNull.string('f')
    t.list.string('g')

    t.nullable.list.nonNull.string('h')

    t.nullable.list.field('i', {
      type: nonNull(SomeRandomType),
    })
  }
});

export const ObjTypeWithMoreDefaults = objectType({
  name: 'ObjTypeWithMoreDefaults',
  nonNullDefaults: {
    output: true,
  },
  definition(t) {
    t.list.field('departments', {
      type: nonNull(GraphQLDepartment),
      resolve: async (costCenter) => {},
    })

    t.int('x')

    t.nullable.int('y')
  }})

export const EasyObject = objectType({
  name: 'EasyObject',
  definition(t) {
    t.date('orderDate')

    t.float('price', {
      resolve: () => 1,
    })

    t.int('x')

    t.nonNull.int('y')
  }})