export const ItRequestFormObjectType = builder.objectRef<ItRequestForm>('ItRequestForm');

ItRequestFormObjectType.implement({
  fields: (t) => ({
    id: t.exposeID('id', {
      nullable: true
    }),
    active: t.exposeBoolean('active', {
      nullable: false
    }),
    departmentIds: t.idList({
      nullable: {
        list: true,
        items: true
      }
    }),
    description: t.exposeString('description', {
      nullable: false
    }),
    fileIdsListNonNullItems: t.exposeID('fileIdsListNonNullItems', {
      nullable: false
    }),
    fileIdsNonNullListNullableItems: t.exposeID('fileIdsNonNullListNullableItems', {
      nullable: false
    }),
    fileIds: t.exposeID('fileIds', {
      nullable: false
    }),
    predecessorCount: t.exposeInt('predecessorCount', {
      nullable: true
    }),
    requirementGroups: t.field({
      type: [ItRequestRequirementGroupObjectType],
      nullable: {
        list: true,
        items: true
      },
      resolve: (obj) => obj.requirementGroups
    }),
    createdAt: t.field({
      type: 'Timestamp',
      nullable: false,
      resolve: (obj) => obj.createdAt
    })
  })
});
