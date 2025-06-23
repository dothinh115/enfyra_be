# Dynamiq

### \u2699\ufe0f **API-first Platform \u2014 Dynamic Schema, Dynamic API, Dynamic Logic, Auto-Sync Multi-Instance/Node**

Dynamiq l\u00e0 m\u1ed9t n\u1ec1n t\u1ea3ng **backend \u0111\u1ed9ng**, k\u1ebft h\u1ee3p gi\u1eefa BaaS/AaaS v\u00e0 **low-code platform** \u2014 v\u1edbi kh\u1ea3 n\u0103ng override logic c\u1ef1c m\u1ea1nh:

- **No-code**: d\u1ef1ng backend + CRUD API + GraphQL API t\u1ef1 \u0111\u1ed9ng ch\u1ec9 trong bu\u1ed5i s\u00e1ng.
- **Low-code**: override logic qua JS/TS handler \u2014 REST + GQL.
- **Multi-instance & multi-node auto-sync**: t\u1ef1 \u0111\u1ed3ng b\u1ed3 schema, API, logic gi\u1eefa c\u00e1c node/instance \u2192 scale-out d\u1ec5 d\u00e0ng.
- **Permission per route / per Query/Mutation**: ph\u00e2n quy\u1ec1n c\u1ef1c chi ti\u1ebft \u1edf t\u1ea7ng API.
- **Snapshot / Backup**: l\u01b0u to\u00e0n b\u1ed9 schema + logic.

---

## \u2728 T\u00ednh n\u0103ng n\u1ed5i b\u1eadt

\u2705 Schema \u0111\u1ed9ng \u2192 sinh CRUD & GQL t\u1ef1 \u0111\u1ed9ng\
\u2705 Override logic d\u1ec5 d\u00e0ng qua JS/TS\
\u2705 Dynamic REST + Dynamic GraphQL\
\u2705 Multi-instance & auto-sync\
\u2705 Snapshot / restore schema\
\u2705 Permission per Query/Mutation (hi\u1ebfm c\u00f3)\
\u2705 UI t\u1ef1 \u0111\u1ed9ng theo metadata

---

## \ud83d\ude80 So s\u00e1nh \u0111\u1ed1i th\u1ee7

| T\u00ednh n\u0103ng                | Directus                          | Strapi                | OneEntry                                | Dynamiq                     |
| ---------------------------------- | --------------------------------- | --------------------- | --------------------------------------- | --------------------------- |
| GraphQL API                        | \u2705 (queries, mutations, subs) | \u2705                | \u2705                                  | \u2705                      |
| Permission per Query/Mutation      | \u2705                            | \u26a0\ufe0f (plugin) | \u2753                                  | \u2705                      |
| Permission per field               | \u2705                            | \u2705                | \u2753                                  | \u274c (ch\u01b0a c\u00f3)  |
| Dynamic Logic (JS handler)         | \u274c                            | \u26a0\ufe0f plugin   | \u2705?                                 | \u2705 (c\u1ef1c m\u1ea1nh) |
| Multi\u2011instance/auto\u2011sync | \u274c                            | \u274c                | \u26a0\ufe0f c\u00f3 gi\u1edbi h\u1ea1n | \u2705                      |

---

## How Dynamic GQL Proxy works

### \ud83d\udcdc Flow:

```
Client \u2192 GQL Proxy Query \u2192 QueryEngine.query(ctx)
                           \u2191
                        C\u00f3 handler_code? \u2192 override to\u00e0n b\u1ed9 logic (JS)
```

---

### GQL Query v\u00ed d\u1ee5:

```graphql
query {
  table_definition(
    filter: { name: { _contains: "user" } }
    page: 1
    limit: 10
  ) {
    data {
      id
      name
      createdAt
    }
    meta {
      totalCount
    }
  }
}
```

---

### To\u00e1n t\u1eed filter hi\u1ec7n t\u1ea1i:

| To\u00e1n t\u1eed | M\u00f4 t\u1ea3                         |
| ----------------- | --------------------------------------- |
| `_eq`             | b\u1eb1ng                               |
| `_neq`            | kh\u00e1c                               |
| `_gt`             | l\u1edbn h\u01a1n                       |
| `_gte`            | l\u1edbn h\u01a1n ho\u1eb7c b\u1eb1ng   |
| `_lt`             | nh\u1ecf h\u01a1n                       |
| `_lte`            | nh\u1ecf h\u01a1n ho\u1eb7c b\u1eb1ng   |
| `_between`        | kho\u1ea3ng gi\u1eefa                   |
| `_in`             | n\u1eb1m trong t\u1eadp                 |
| `_not_in`         | kh\u00f4ng n\u1eb1m trong t\u1eadp      |
| `_is_null`        | is null / not null                      |
| `_contains`       | LIKE '%x%'                              |
| `_starts_with`    | LIKE 'x%'                               |
| `_ends_with`      | LIKE '%x'                               |
| `_not`            | NOT (bao quanh nh\u00f3m)               |
| `_count`          | count tr\u00ean relation nhi\u1ec1u     |
| `_eq_set`         | match set tr\u00ean relation nhi\u1ec1u |

---

### Override logic (GQL Proxy Query):

- N\u1ebfu kh\u00f4ng c\u00f3 handler_code \u2192 m\u1eb7c \u0111\u1ecbnh d\u00f9ng `QueryEngine.query(ctx)`
- N\u1ebfu c\u00f3 handler_code (JS string) \u2192 override to\u00e0n b\u1ed9 logic (c\u00f3 th\u1ec3 d\u00f9ng `$repos.xxx.find()`)

---

### API `$repos.xxx` hi\u1ec7n t\u1ea1i:

| Method                                  | Support hi\u1ec7n t\u1ea1i |
| --------------------------------------- | -------------------------- |
| `.find({ where })`                      | \u2705 override filter     |
| `.create(body)`                         | \u2705                     |
| `.update(id, body)`                     | \u2705                     |
| `.delete(id)`                           | \u2705                     |
| `.count()`                              | \u274c (ch\u01b0a c\u00f3) |
| `.find() + custom where inside .find()` | \u2705                     |

---

### V\u00ed d\u1ee5 override handler_code:

```js
// N\u1ebfu user kh\u00f4ng ph\u1ea3i admin \u2192 ch\u1ec9 th\u1ea5y static = false
if ($ctx.user.role !== 'admin') {
  return await $repos.table_definition.find({
    where: {
      isStatic: false,
    },
  });
}

return await $repos.table_definition.find({
  where: $ctx.args.filter,
});
```

---

## \ud83d\udc6f\ufe0f \u0110\u1ecbnh v\u1ecb Dynamiq

- **No-code** \u2192 d\u1ef1ng API nhanh
- **Low-code** \u2192 override logic c\u1ef1c d\u1ec5
- **Permission action-level**: REST + GraphQL
- **Scale-out multi-instance**
- **Meta-driven UI** \u2192 kh\u00f4ng c\u1ea7n code UI c\u1ee9ng
- **Snapshot & Restore**

---

## \ud83d\udc65 Ng\u01b0\u1eddi d\u00f9ng m\u1ee5c ti\u00eau

1\ufe0f Dev c\u00e1 nh\u00e2n / team nh\u1ecf c\u1ea7n backend nhanh\
2\ufe0f App l\u1edbn, SaaS c\u1ea7n scale-out multi-instance\
3\ufe0f N\u1ec1n t\u1ea3ng cloud c\u1ea7n dynamic schema per-tenant

---

## \ud83d\udcd9 T\u00e0i li\u1ec7u & Roadmap

- [Quickstart Guide](https://github.com/\u2026)
- [Demo v\u00ed d\u1ee5](https://github.com/\u2026)
- [Roadmap](https://github.com/\u2026)
