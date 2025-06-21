export function findMainTableName(selections: any[]): string | undefined {
  for (const selection of selections) {
    if (selection.kind === 'InlineFragment') {
      return selection.typeCondition.name.value;
    } else if (selection.selectionSet?.selections) {
      const inner = findMainTableName(selection.selectionSet.selections);
      if (inner) return inner;
    }
  }
  return undefined;
}
