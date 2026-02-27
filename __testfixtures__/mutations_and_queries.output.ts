import { builder } from "@/schema/builder.js";
export const doThings = builder.mutationField("doThings", t => t.field({
  type: SomeType,
  nullable: false,

  args: {
    id: t.arg.id({
      required: true
    }),

    randomType: t.arg({
      type: RandomType,
      required: true
    })
  },

  async resolve() {
    return null;
  }
}));

export const otherStuff = builder.mutationField("otherStuff", t => t.field({
  type: OtherType,
  nullable: false,

  args: {
    id: t.arg.id({
      required: true
    }),

    str: t.arg.string()
  },

  async resolve() {
    return 123;
  }
}));

export const otherStuff2 = builder.queryField("someQuery", t => t.field({
  type: [OtherType],

  nullable: {
    list: false,
    items: true
  },

  args: {
    id: t.arg.id({
      required: true
    }),

    str: t.arg.string()
  },

  authScopes: (source, args, ctx) => !!ctx.user,

  async resolve() {
    return 123;
  }
}));

export const otherStuff3 = builder.queryField("someQuery", t => t.field({
  type: [OtherType],

  nullable: {
    list: true,
    items: true
  },

  args: {
    id: t.arg.id({
      required: true
    }),

    str: t.arg.string()
  },

  async resolve() {
    return 123;
  }
}));

export const otherStuff4 = builder.queryField("someQuery", t => t.field({
  type: OtherType,
  nullable: true,
  args: {},

  async resolve() {
    return 123;
  }
}));


export const EmployeeQuery = builder.queryType({
  fields: t => ({
    hasEmployees: t.boolean({
      nullable: false,
      resolve: () => true
    }),

    employee: t.field({
      type: GraphQLEmployee,
      nullable: false,

      args: {
        id: t.arg.id({
          required: true
        })
      },

      resolve: authenticated((_, {id}) => EmployeeLoader.load(Number(id)))
    }),

    employees: t.field({
      type: GraphQLPaginatedEmployees,
      nullable: false,

      args: {
        filter: t.arg({
          type: GraphQLEmployeeFilter
        }),

        limit: t.arg.int(),
        offset: t.arg.int(),

        dependencyFilter: t.arg({
          type: GraphQLDependencyFilter,
          required: false
        })
      },

      resolve: employeesResolver
    })
  })
});

export const EmployeeMutations = builder.mutationType({
  fields: t => ({
    createEmployee: t.field({
      type: GraphQLEmployee,
      nullable: false,

      args: {
        name: t.arg.string({
          required: true
        }),

        departmentId: t.arg.id()
      },

      resolve: createEmployeeResolver
    }),

    archiveEmployee: t.field({
      type: GraphQLEmployee,
      nullable: false,

      args: {
        id: t.arg.id({
          required: true
        })
      },

      authScopes: (root, args, ctx) => !!ctx.user,
      resolve: archiveEmployeeResolver
    }),

    privileges: t.field({
      type: [GraphQLPrivilege],

      nullable: {
        list: false,
        items: false
      },

      args: {
        filter: t.arg({
          type: GraphQLPrivilegeGroupFilter
        })
      },

      resolve: (group, {filter}) =>
        prisma.privilegeGroup
          .findUniqueOrThrow({where: {id: group.id}})
          .privileges({where: {id: {contains: filter?.searchTerm ?? undefined}}})
    })
  })
});

