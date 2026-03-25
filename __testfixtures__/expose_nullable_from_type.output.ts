type SupplierBranch = {
  branchId: string;
  supplierId: string | null;
  optionalLabel?: string;
  count: number;
};

export const GraphQLSupplierBranch = builder.objectRef<SupplierBranch>('SupplierBranch');

GraphQLSupplierBranch.implement({
  fields: (t) => ({
    branchId: t.exposeID('branchId', {
      nullable: false
    }),
    supplierId: t.exposeID('supplierId', {
      nullable: true
    }),
    optionalLabel: t.exposeString('optionalLabel', {
      nullable: true
    }),
    count: t.exposeInt('count', {
      description: 'Count field',
      nullable: false
    }),
    alreadyNullable: t.exposeString('supplierId', { nullable: true }),
    dynamicField: t.exposeString(dynamicFieldName)
  })
});
