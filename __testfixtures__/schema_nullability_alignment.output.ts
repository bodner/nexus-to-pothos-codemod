export const ItRequestFormObjectType = builder.objectRef<ItRequestForm>('ItRequestForm');

ItRequestFormObjectType.implement({
  fields: (t) => ({
    id: t.exposeID('id', {
      nullable: true
    }),
    active: t.exposeBoolean('active', {
      nullable: true
    }),
    departmentIds: t.idList({
      nullable: {
        list: false,
        items: false
      }
    }),
    description: t.exposeString('description', {
      nullable: true
    }),
    fileIdsListNonNullItems: t.exposeIDList('fileIdsListNonNullItems', {
      nullable: {
        list: true,
        items: false
      }
    }),
    fileIdsNonNullListNullableItems: t.exposeIDList('fileIdsNonNullListNullableItems', {
      nullable: {
        list: false,
        items: true
      }
    }),
    fileIds: t.exposeIDList('fileIds', {
      nullable: {
        list: false,
        items: false
      }
    }),
    predecessorCount: t.exposeInt('predecessorCount', {
      nullable: false
    }),
    requirementGroups: t.field({
      type: [ItRequestRequirementGroupObjectType],

      nullable: {
        list: false,
        items: true
      },

      resolve: (obj) => obj.requirementGroups
    }),
    createdAt: t.field({
      type: 'Timestamp',
      nullable: true,
      resolve: (obj) => obj.createdAt
    })
  })
});
