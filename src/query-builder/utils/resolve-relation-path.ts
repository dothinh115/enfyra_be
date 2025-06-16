import { EntityMetadata } from 'typeorm';

export function resolveRelationPath(
  path: string[],
  meta: EntityMetadata,
  rootAlias: string,
  aliasMap: Map<string, string>,
  joinSet: Set<string>,
  select: Set<string>,
) {
  for (let i = 0; i < path.length; i++) {
    const aliasKey = path.slice(0, i + 1).join('.'); // cha.con.con
    const parentKey = path.slice(0, i).join('.');
    const parentAlias = aliasMap.get(parentKey) || rootAlias;
    const part = path[i];

    const aliasSafe = aliasKey.replace(/\./g, '_'); // để dùng trong SQL

    if (!aliasMap.has(aliasKey)) {
      joinSet.add(`${parentAlias}.${part}|${aliasSafe}`); // dùng aliasSafe để join
      aliasMap.set(aliasKey, aliasSafe); // vẫn dùng key là cha.con
    }

    const rel = meta.relations.find((r) => r.propertyName === part);
    if (!rel) break;

    meta = rel.inverseEntityMetadata;

    const idCol = meta.primaryColumns[0]?.propertyName || 'id';
    select.add(`${aliasSafe}.${idCol}`); // dùng aliasSafe
  }
}
