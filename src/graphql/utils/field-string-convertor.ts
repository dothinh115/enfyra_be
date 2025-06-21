export function convertFieldNodesToFieldPicker(info: any): string[] {
  const selections = info.fieldNodes?.[0]?.selectionSet?.selections || [];

  // Tìm InlineFragment → dynamic type
  const fragment = selections.find((sel) => sel.kind === 'InlineFragment');

  if (!fragment) return [];

  const dataField = fragment.selectionSet.selections.find(
    (sel) => sel.kind === 'Field' && sel.name.value === 'data',
  );

  if (!dataField) return [];

  const fieldSelections = dataField.selectionSet?.selections || [];

  return fieldSelections
    .filter((sel) => sel.kind === 'Field')
    .map((sel) => sel.name.value);
}
