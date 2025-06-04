export function getCompareKey(dbType: string) {
  return {
    _eq: '=',
    _neq: '!=',
    _lt: '<',
    _lte: '<=',
    _gt: '>',
    _gte: '>=',
    _contains: dbType === 'postgres' ? 'ILIKE' : 'LIKE',
    _ncontains: dbType === 'postgres' ? 'NOT ILIKE' : 'NOT LIKE',
    _in: 'IN',
    _nin: 'NOT IN',
  };
}
