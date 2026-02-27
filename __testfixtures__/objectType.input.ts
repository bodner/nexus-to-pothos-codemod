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
  }
});