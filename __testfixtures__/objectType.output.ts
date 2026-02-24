export const SomeObjectType = builder.objectRef<SomeObjectType>('SomeObjectType')
  .implement({
  interfaces: [SomeType1],

  fields: t => ({
    a: t.exposeID('a'),
    b: t.exposeFloat('b'),

    c: t.exposeFloat('c', {
      nullable: true
    }),

    d: t.expose('d', {
      type: SomeEnum,
      nullable: true
    }),

    e: t.string({
      nullable: true,

      resolve(value: any) {
        return value.doSmthng();
      }
    }),

    f: t.field({
      type: SomeType,

      async resolve(rootObject: any, args, ctx) {
        return ctx.smthng();
      }
    }),

    g: t.float({
      resolve: () => 1
    }),

    h: t.field({
      type: [Type],
      resolve: (somthng) => smthng.a()
    })
  })
});

export const Interface = builder.interfaceRef<SomeType1>('SomeType1')
  .implement({
  fields: t => ({
    id: t.id(),
    stringField: t.string(),

    resolvableField: t.field({
      type: SomeType2,

      async resolve(rootObject, args, ctx) {
        return 123;
      }
    })
  }),

  resolveType(item) {
    return item.__typename;
  }
});

export const Input = builder.inputType('Input', {
  fields: t => ({
    a: t.string(),
    b: t.int(),
    c: t.int(),
    d: t.int()
  })
});

export const RandomObjectType = builder.objectRef<RandomObjectType>('RandomObjectType')
  .implement({
  fields: t => ({
    listOfNullableBooleans: t.booleanList({
      required: false,
      nullable: true,
      resolve: () => [true, null, false]
    }),

    nonNullListOfNullableStrings: t.stringList({
      nullable: false,
      required: false,
      resolve: () => ['a', null, 'b']
    }),

    nonNullListOfNullableObjects: t.field({
      type: [SomeRandomType],
      required: false,
      nullable: false,
      resolve: () => [new SomeRandomType(), new SomeRandomType()]
    })
  })
});

export const ListObjectType = builder.objectRef<ListObjectType>('ListObjectType')
  .implement({
  fields: t => ({
    departments: t.field({
      type: [GraphQLDepartment],
      required: true,
      nullable: true,

      resolve: () => {
        return [
          { id: '1', name: 'HR' },
          { id: '2', name: 'Engineering' }
        ];
      }
    }),

    divisions: t.field({
      type: [GraphQLDivision],
      required: true,
      nullable: false,

      resolve: () => {
        return [
          { id: '1', name: 'Sales' },
          { id: '2', name: 'Marketing' }
        ];
      }
    }),

    companies: t.field({
      type: [GraphQLCompany],
      required: false,
      nullable: true,

      resolve: () => {
        return [
          { id: '1', name: 'Company1' },
          { id: '2', name: 'Company2' }
        ];
      }
    })
  })
});

export const InputWithField = builder.inputType('InputWithField', {
  fields: t => ({
    departments: t.field({
      type: list(nonNull(GraphQLEmployeeDepartmentOptionalInput))
    })
  })
});

export const DeviceWithUser = builder.objectRef<DeviceWithUser>('DeviceWithUser')
  .implement({
  fields: t => ({
    deviceId: t.exposeString('deviceId'),

    user: t.field({
      type: GraphQLUser,

      resolve: (device) =>
        prisma.device
          .findUniqueOrThrow({
            where: {
              deviceId: device.deviceId,
            },
          })
          .user()
    })
  })
});

export const DeviceWithNullableUser = builder.objectRef<DeviceWithNullableUser>('DeviceWithNullableUser')
  .implement({
  fields: t => ({
    deviceId: t.exposeString('deviceId'),

    user: t.field({
      type: GraphQLUser,
      nullable: true,

      resolve: (device) =>
        prisma.device
          .findUniqueOrThrow({
            where: {
              deviceId: device.deviceId,
            },
          })
          .user()
    })
  })
});