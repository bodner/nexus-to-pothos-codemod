type SupplierBranch = {
  branchId: string;
  supplierId: string | null;
  optionalLabel?: string;
  count: number;
};

export const GraphQLSupplierBranch = builder.objectRef<SupplierBranch>('SupplierBranch');

GraphQLSupplierBranch.implement({
  fields: (t) => ({
    branchId: t.exposeID('branchId', {}),
    supplierId: t.exposeID('supplierId'),
    optionalLabel: t.exposeString('optionalLabel'),
    count: t.exposeInt('count', { description: 'Count field' }),
    alreadyNullable: t.exposeString('supplierId', { nullable: true }),
    dynamicField: t.exposeString(dynamicFieldName)
  })
});
