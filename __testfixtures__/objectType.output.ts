import { builder } from "@/schema/builder.js";

import {
  DeviceWithNullableUser,
  DeviceWithUser,
  ListObjectType,
  RandomObjectType,
  SomeObjectType,
} from "@prisma/client";

export const SomeObjectType = builder.objectRef<SomeObjectType>('SomeObjectType')
  .implement({
  interfaces: [SomeType1],

  fields: t => ({
    a: t.exposeID('a'),
    b: t.exposeFloat('b'),
    c: t.exposeFloat('c'),

    d: t.expose('d', {
      type: SomeEnum
    }),

    e: t.string({
      nullable: true,

      resolve(value: any) {
        return value.doSmthng();
      }
    }),

    f: t.field({
      type: SomeType,
      nullable: false,

      async resolve(rootObject: any, args, ctx) {
        return ctx.smthng();
      }
    }),

    g: t.float({
      nullable: false,
      resolve: () => 1
    }),

    h: t.field({
      type: [Type],

      nullable: {
        list: true,
        items: true
      },

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
      nullable: false,
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
    d: t.int(),

    legacyId: t.id({
      required: false,
      deprecationReason: 'Use formVersionId field instead!'
    })
  })
});

export const RandomObjectType = builder.objectRef<RandomObjectType>('RandomObjectType')
  .implement({
  fields: t => ({
    listOfNullableBooleans: t.booleanList({
      nullable: {
        list: true,
        items: true
      },

      resolve: () => [true, null, false]
    }),

    nonNullListOfNullableStrings: t.stringList({
      nullable: {
        list: false,
        items: true
      },

      resolve: () => ['a', null, 'b']
    }),

    nonNullListOfNullableObjects: t.field({
      type: [SomeRandomType],

      nullable: {
        list: false,
        items: true
      },

      resolve: () => [new SomeRandomType(), new SomeRandomType()]
    })
  })
});

export const ListObjectType = builder.objectRef<ListObjectType>('ListObjectType')
  .implement({
  fields: t => ({
    departments: t.field({
      type: [GraphQLDepartment],

      nullable: {
        list: true,
        items: false
      },

      resolve: () => {
        return [
          { id: '1', name: 'HR' },
          { id: '2', name: 'Engineering' }
        ];
      }
    }),

    divisions: t.field({
      type: [GraphQLDivision],

      nullable: {
        list: false,
        items: false
      },

      resolve: () => {
        return [
          { id: '1', name: 'Sales' },
          { id: '2', name: 'Marketing' }
        ];
      }
    }),

    companies: t.field({
      type: [GraphQLCompany],

      nullable: {
        list: true,
        items: true
      },

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
      required: {
        list: true,
        items: false
      },

      type: [GraphQLEmployeeDepartmentOptionalInput]
    }),

    keywords: t.field({
      required: {
        list: true,
        items: true
      },

      type: [GraphQLRecordKeywordInput]
    })
  })
});

export const DeviceWithUser = builder.objectRef<DeviceWithUser>('DeviceWithUser')
  .implement({
  fields: t => ({
    deviceId: t.exposeString('deviceId'),

    user: t.field({
      type: GraphQLUser,
      nullable: false,

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
    }),

    hasPrivilege: t.boolean({
      nullable: false,

      args: {
        privilegeId: t.arg.string({
          required: true
        })
      },

      resolve: (user, {privilegeId}) => userHasPrivilege(user.id, privilegeId as PrivilegeId)
    }),

    lastLogin: t.field({
      nullable: true,
      type: "DateTime",
      resolve: (user) => user.lastLogin
    }),

    createdAt: t.field({
      type: "DateTime",
      nullable: true,
      resolve: obj => obj.createdAt
    }),

    lastSeenAt: t.field({
      type: "Timestamp",
      nullable: true,
      resolve: obj => obj.lastSeenAt
    }),

    birthday: t.field({
      type: "Date",
      nullable: false,
      resolve: obj => obj.birthday
    }),

    metadata: t.field({
      type: "JSON",
      nullable: true,
      resolve: obj => obj.metadata
    }),

    settings: t.field({
      type: "JSONObject",
      nullable: false,
      resolve: obj => obj.settings
    }),

    randomDate: t.field({
      type: 'DateTime',
      nullable: false,
      resolve: obj => obj.randomDate
    }),

    processedAt: t.field({
      type: 'Timestamp',
      nullable: false,
      resolve: obj => obj.processedAt
    }),

    nationalHoliday: t.field({
      type: 'Date',
      nullable: true,
      resolve: obj => obj.nationalHoliday
    }),

    rawPayload: t.field({
      type: 'JSON',
      nullable: false,
      resolve: obj => obj.rawPayload
    }),

    normalizedPayload: t.field({
      type: 'JSONObject',
      nullable: true,
      resolve: obj => obj.normalizedPayload
    })
  })
});
