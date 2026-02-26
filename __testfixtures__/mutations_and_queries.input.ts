export const doThings = mutationField('doThings', {
  type: SomeType,
  args: {
    id: nonNull(idArg()),
    randomType: nonNull(RandomType)
  },
  async resolve() {
    return null;
  }
});

export const otherStuff = mutationField('otherStuff', {
  type: OtherType,
  args: {
    id: nonNull(idArg()),
    str: stringArg(),
  },
  async resolve() {
    return 123;
  }
});

export const otherStuff2 = queryField('someQuery', {
  type: list(OtherType),
  args: {
    id: nonNull(idArg()),
    str: stringArg(),
  },
  authorize: (source, args, ctx) => !!ctx.user,
  async resolve() {
    return 123;
  }
});

export const otherStuff3 = queryField('someQuery', {
  type: nullable(list(OtherType)),
  args: {
    id: nonNull(idArg()),
    str: stringArg(),
  },
  async resolve() {
    return 123;
  }
});

export const otherStuff4 = queryField('someQuery', {
  type: nullable(OtherType),
  args: {},
  async resolve() {
    return 123;
  }
});


export const EmployeeQuery = queryField((t) => {
  t.nonNull.boolean('hasEmployees', {
    resolve: () => true,
  })

  t.nonNull.field('employee', {
    type: GraphQLEmployee,
    args: {
      id: nonNull(idArg()),
    },
    resolve: authenticated((_, {id}) => EmployeeLoader.load(Number(id))),
  })

  t.nonNull.field('employees', {
    type: GraphQLPaginatedEmployees,
    args: {
      filter: GraphQLEmployeeFilter,
      limit: intArg(),
      offset: intArg(),
      dependencyFilter: nullable(GraphQLDependencyFilter),
    },
    resolve: employeesResolver,
  })
});

export const EmployeeMutations = mutationField((t) => {
  t.nonNull.field('createEmployee', {
    type: GraphQLEmployee,
    args: {
      name: nonNull(stringArg()),
      departmentId: idArg(),
    },
    resolve: createEmployeeResolver,
  })

  t.field('archiveEmployee', {
    type: GraphQLEmployee,
    args: {
      id: nonNull(idArg()),
    },
    authorize: (root, args, ctx) => !!ctx.user,
    resolve: archiveEmployeeResolver,
  })

  t.nonNull.list.nonNull.field('privileges', {
      type: GraphQLPrivilege,
      args: {
        filter: arg({type: GraphQLPrivilegeGroupFilter}),
      },
      resolve: (group, {filter}) =>
        prisma.privilegeGroup
          .findUniqueOrThrow({where: {id: group.id}})
          .privileges({where: {id: {contains: filter?.searchTerm ?? undefined}}}),
    })
});
