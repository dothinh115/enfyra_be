# Dynamiq

### ⚙️ **API-first Platform — Dynamic Schema, Dynamic API, Dynamic Logic, Auto-Sync Multi-Instance/Node**

Dynamiq là một nền tảng **backend động**, kết hợp giữa BaaS/AaaS và **low-code platform** — với khả năng override logic cực mạnh:

- **No-code**: dựng backend + CRUD API + GraphQL API tự động chỉ trong buổi sáng.
- **Low-code**: override logic qua JS/TS handler — REST + GQL.
- **Multi-instance & multi-node auto-sync**: tự đồng bộ schema, API, logic giữa các node/instance → scale-out dễ dàng.
- **Permission per route / per Query/Mutation**: phân quyền cực chi tiết ở tầng API.
- **Snapshot / Backup**: lưu toàn bộ schema + logic.

---

## ✨ Tính năng nổi bật

✅ Schema động → sinh CRUD & GQL tự động  
✅ Override logic dễ dàng qua JS/TS  
✅ Dynamic REST + Dynamic GraphQL  
✅ Multi-instance & auto-sync  
✅ Snapshot / restore schema  
✅ Permission per Query/Mutation (hiếm có)  
✅ UI tự động theo metadata

---

## 🚀 So sánh đối thủ

| Tính năng                     | Directus                      | Strapi      | OneEntry       | Dynamiq       |
| ----------------------------- | ----------------------------- | ----------- | -------------- | ------------- |
| GraphQL API                   | ✅ (queries, mutations, subs) | ✅          | ✅             | ✅            |
| Permission per Query/Mutation | ✅                            | ⚠️ (plugin) | ❓             | ✅            |
| Permission per field          | ✅                            | ✅          | ❓             | ❌ (chưa có)  |
| Dynamic Logic (JS handler)    | ❌                            | ⚠️ plugin   | ✅?            | ✅ (cực mạnh) |
| Multi-instance/auto-sync      | ❌                            | ❌          | ⚠️ có giới hạn | ✅            |

---

## How Dynamic GQL Proxy works

### 🗺️ Flow:

```
Client → GQL Proxy Query → QueryEngine.query(ctx)
                           ↑
                        Có handler_code? → override toàn bộ logic (JS)
```

---

### GQL Query ví dụ:

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

### Toán tử filter hiện tại:

| Toán tử        | Mô tả                         |
| -------------- | ----------------------------- |
| `_eq`          | bằng                          |
| `_neq`         | khác                          |
| `_gt`          | lớn hơn                       |
| `_gte`         | lớn hơn hoặc bằng             |
| `_lt`          | nhỏ hơn                       |
| `_lte`         | nhỏ hơn hoặc bằng             |
| `_between`     | khoảng giữa                   |
| `_in`          | nằm trong tập                 |
| `_not_in`      | không nằm trong tập           |
| `_is_null`     | is null / not null            |
| `_contains`    | LIKE '%x%'                    |
| `_starts_with` | LIKE 'x%'                     |
| `_ends_with`   | LIKE '%x'                     |
| `_not`         | NOT (bao quanh nhóm)          |
| `_count`       | count trên relation nhiều     |
| `_eq_set`      | match set trên relation nhiều |

---

### Override logic (GQL Proxy Query):

- Nếu không có handler_code → mặc định dùng `QueryEngine.query(ctx)`
- Nếu có handler_code (JS string) → override toàn bộ logic (có thể dùng `$repos.xxx.find()`)

---

### API `$repos.xxx` hiện tại:

| Method                                  | Support hiện tại   |
| --------------------------------------- | ------------------ |
| `.find({ where })`                      | ✅ override filter |
| `.create(body)`                         | ✅                 |
| `.update(id, body)`                     | ✅                 |
| `.delete(id)`                           | ✅                 |
| `.count()`                              | ❌ (chưa có)       |
| `.find() + custom where inside .find()` | ✅                 |

---

### Ví dụ override handler_code:

```js
// Nếu user không phải admin → chỉ thấy static = false
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

## How Dynamic REST works

### 🗺️ Flow:

```
Client → REST Request → RouteDetectMiddleware → DynamicService.execute()
                                        ↑
                                Có handler_code? → override toàn bộ logic (JS)
```

---

### REST Endpoint mặc định:

| Method | Endpoint                | Mặc định      |
| ------ | ----------------------- | ------------- |
| GET    | `/table_definition`     | list + filter |
| GET    | `/table_definition/:id` | get by id     |
| POST   | `/table_definition`     | create        |
| PATCH  | `/table_definition/:id` | update        |
| DELETE | `/table_definition/:id` | delete        |

---

### Override logic (REST):

- Nếu không có handler_code → DynamicService thực thi CRUD mặc định
- Nếu có handler_code → override toàn bộ logic (JS)

### Ví dụ override REST GET `/my-account`:

```js
return await $repos.user.find({
  where: {
    id: { _eq: $ctx.user.id },
  },
});
```

### Ví dụ override REST POST `/publish-post`:

```js
if (!$ctx.user) throw new Error('Unauthorized');

const post = await $repos.post.find({
  where: { id: $ctx.body.id },
});

if (post.data[0].authorId !== $ctx.user.id) {
  throw new Error('Not your post');
}

await $repos.post.update($ctx.body.id, {
  published: true,
});

return { success: true };
```

---

## 👫 Định vị Dynamiq

- **No-code** → dựng API nhanh
- **Low-code** → override logic cực dễ
- **Permission action-level**: REST + GraphQL
- **Scale-out multi-instance**
- **Meta-driven UI** → không cần code UI cứng
- **Snapshot & Restore**

---

## 👥 Người dùng mục tiêu

1️⃣ Dev cá nhân / team nhỏ cần backend nhanh  
2️⃣ App lớn, SaaS cần scale-out multi-instance  
3️⃣ Nền tảng cloud cần dynamic schema per-tenant

---
