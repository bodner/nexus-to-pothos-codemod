import { builder } from "#/schema/builder.js";
export const SomeEnum = builder.enumType('SomeEnum', {
  values: ['a', 'b', 'c'] as const
});