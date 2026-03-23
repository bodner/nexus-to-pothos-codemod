import { builder } from "@/schema/index.js";
export const SomeEnum = builder.enumType('SomeEnum', {
  values: ['a', 'b', 'c'] as const
});

export const GraphQLIndustryType = builder.enumType('IndustryType', {
  values: ['Free', 'Qualified'] as const
})

export const GraphQLEmployeeType = builder.enumType(EmployeeType, {
  name: 'EmployeeType',
})