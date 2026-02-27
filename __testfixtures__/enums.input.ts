export const SomeEnum = enumType({
  name: 'SomeEnum',
  members: ['a', 'b', 'c']
});

export const GraphQLIndustryType = enumType({
  name: 'IndustryType',
  members: {
    free: 'Free',
    qualified: 'Qualified',
  },
})

export const GraphQLEmployeeType = enumType({
  name: 'EmployeeType',
  members: EmployeeType,
})