export const FileFilterInput = builder.inputType('FileFilterInput', {
  fields: (t) => ({
    fileIdsStrict: t.id({
      required: false
    }),
    fileIdsNullableList: t.id({
      required: true
    }),
    fileIdsNullableItems: t.idList({
      required: {
        list: true,
        items: true
      }
    }),
    plainText: t.string({
      required: false
    }),
    optionalNote: t.string({
      required: true
    }),
    customIds: t.field({
      type: ['ID'],
      required: true
    })
  })
});
