import { Brackets, EntityMetadata } from 'typeorm';
import { walkFilter } from '../query-engine/utils/walk-filter';

function createMockQB() {
  const calls: any[] = [];
  const qb: any = {
    andWhere: (...args: any[]) => {
      calls.push(['andWhere', ...args]);
      return qb;
    },
    orWhere: (...args: any[]) => {
      calls.push(['orWhere', ...args]);
      return qb;
    },
    getCalls: () => calls,
  };
  return qb;
}

function createFakeMeta(
  tableName: string,
  columns: string[],
  relations: Record<string, EntityMetadata> = {},
  joinColumnName = 'tableId',
): EntityMetadata {
  return {
    tableName,
    columns: columns.map((c) => ({ propertyName: c })),
    relations: Object.entries(relations).map(([name, relMeta]) => ({
      propertyName: name,
      inverseEntityMetadata: relMeta,
      inverseRelation: {
        joinColumns: [{ databaseName: joinColumnName }],
      },
    })),
    primaryColumns: [{ propertyName: 'id' }],
  } as EntityMetadata;
}

describe('walkFilter', () => {
  const baseMeta = createFakeMeta('table', ['id', 'name', 'age', 'createdAt']);

  it('handles simple _in on root field', () => {
    const qb = createMockQB();
    const params = {};
    walkFilter(
      { id: { _in: [1, 2, 3] } },
      [],
      baseMeta,
      'and',
      qb,
      params,
      false,
      'table',
      new Map([['', 'table']]),
      new Set(),
      new Set(),
    );
    expect(qb.getCalls()[0]).toEqual([
      'andWhere',
      'table.id IN (:...id_0)',
      { id_0: [1, 2, 3] },
    ]);
  });

  it('supports _ne and _eq', () => {
    const qb = createMockQB();
    const params = {};
    walkFilter(
      { name: { _ne: 'admin' }, age: { _eq: 30 } },
      [],
      baseMeta,
      'and',
      qb,
      params,
      false,
      'table',
      new Map([['', 'table']]),
      new Set(),
      new Set(),
    );
    expect(qb.getCalls()[0][1]).toMatch(/table\.name != :name_/);
    expect(qb.getCalls()[1][1]).toMatch(/table\.age = :age_/);
  });

  it('supports _contains', () => {
    const qb = createMockQB();
    const params = {};
    walkFilter(
      { name: { _contains: 'abc' } },
      [],
      baseMeta,
      'and',
      qb,
      params,
      false,
      'table',
      new Map([['', 'table']]),
      new Set(),
      new Set(),
    );
    const call = qb.getCalls()[0];
    expect(call[1]).toContain('LIKE');
    expect(Object.values(params)[0]).toContain('%abc%');
  });

  it('supports _starts_with', () => {
    const qb = createMockQB();
    const params = {};
    walkFilter(
      { name: { _starts_with: 'pre' } },
      [],
      baseMeta,
      'and',
      qb,
      params,
      false,
      'table',
      new Map([['', 'table']]),
      new Set(),
      new Set(),
    );
    expect(Object.values(params)[0]).toBe('pre%');
  });

  it('supports _ends_with', () => {
    const qb = createMockQB();
    const params = {};
    walkFilter(
      { name: { _ends_with: 'xyz' } },
      [],
      baseMeta,
      'and',
      qb,
      params,
      false,
      'table',
      new Map([['', 'table']]),
      new Set(),
      new Set(),
    );
    expect(Object.values(params)[0]).toBe('%xyz');
  });

  it('supports _between operator', () => {
    const qb = createMockQB();
    const params = {};
    walkFilter(
      { age: { _between: [10, 20] } },
      [],
      baseMeta,
      'and',
      qb,
      params,
      false,
      'table',
      new Map([['', 'table']]),
      new Set(),
      new Set(),
    );
    expect(qb.getCalls()[0][1]).toContain('age BETWEEN');
    expect(Object.values(params)).toEqual(expect.arrayContaining([10, 20]));
  });

  it('supports _is_null and _is_nnull', () => {
    const qb1 = createMockQB();
    walkFilter(
      { name: { _is_null: true } },
      [],
      baseMeta,
      'and',
      qb1,
      {},
      false,
      'table',
      new Map([['', 'table']]),
      new Set(),
      new Set(),
    );
    expect(qb1.getCalls()[0][1]).toContain('IS NULL');

    const qb2 = createMockQB();
    walkFilter(
      { name: { _is_nnull: true } },
      [],
      baseMeta,
      'and',
      qb2,
      {},
      false,
      'table',
      new Map([['', 'table']]),
      new Set(),
      new Set(),
    );
    expect(qb2.getCalls()[0][1]).toContain('IS NOT NULL');
  });

  it('supports multiple and/or nesting', () => {
    const qb = createMockQB();
    const params = {};
    walkFilter(
      {
        and: [
          { id: { _eq: 1 } },
          {
            or: [{ name: { _eq: 'a' } }, { name: { _eq: 'b' } }],
          },
        ],
      },
      [],
      baseMeta,
      'and',
      qb,
      params,
      false,
      'table',
      new Map([['', 'table']]),
      new Set(),
      new Set(),
    );
    const calls = qb.getCalls();
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe('andWhere');
    expect(calls[0][1]).toBeInstanceOf(Brackets);
  });

  it('supports _not block', () => {
    const qb = createMockQB();
    const params = {};
    walkFilter(
      { _not: { name: { _eq: 'abc' } } },
      [],
      baseMeta,
      'and',
      qb,
      params,
      false,
      'table',
      new Map([['', 'table']]),
      new Set(),
      new Set(),
    );
    expect(qb.getCalls()[0][0]).toBe('andWhere');
    expect(qb.getCalls()[0][1]).toBeInstanceOf(Brackets);
  });
});
