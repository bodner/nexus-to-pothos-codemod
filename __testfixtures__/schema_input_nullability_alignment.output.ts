export const FileFilterInput = builder.inputType('FileFilterInput', {
  fields: (t) => ({
    fileIdsStrict: t.idList({
      required: {
        list: true,
        items: true
      }
    }),
    fileIdsNullableList: t.idList({
      required: {
        list: false,
        items: true
      }
    }),
    fileIdsNullableItems: t.idList({
      required: {
        list: true,
        items: false
      }
    }),
    plainText: t.string({
      required: true
    }),
    optionalNote: t.string({
      required: false
    }),
    customIds: t.field({
      type: ['ID'],

      required: {
        list: false,
        items: false
      }
    })
  })
});
