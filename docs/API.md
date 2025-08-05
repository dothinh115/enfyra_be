# API Documentation

## Overview

Enfyra Backend provides both REST and GraphQL APIs for dynamic data operations. All APIs are automatically generated based on table definitions and can be customized with JavaScript handlers.

## REST API

### Base URL

```
http://localhost:1105
```

### Authentication

All API endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Default Endpoints

#### List Records

```http
GET /{table_name}
```

**Query Parameters:**

- `filter[field][operator]=value` - Filter records
- `sort[field]=asc|desc` - Sort records
- `page=number` - Page number (default: 1)
- `limit=number` - Records per page (default: 10, 0 for all)
- `fields=field1,field2` - Select specific fields
- `include=relation1,relation2` - Include related data

**Example:**

```bash
curl "http://localhost:1105/posts?filter[title][_contains]=hello&sort[createdAt]=desc&page=1&limit=10"
```

#### Get Single Record

```http
GET /{table_name}/{id}
```

**Example:**

```bash
curl "http://localhost:1105/posts/1"
```

#### Create Record

```http
POST /{table_name}
```

**Example:**

```bash
curl -X POST http://localhost:1105/posts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Hello World",
    "content": "This is my first post"
  }'
```

#### Update Record

```http
PATCH /{table_name}/{id}
```

**Example:**

```bash
curl -X PATCH http://localhost:1105/posts/1 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title"
  }'
```

#### Delete Record

```http
DELETE /{table_name}/{id}
```

**Example:**

```bash
curl -X DELETE http://localhost:1105/posts/1
```

### Filter Operators

| Operator       | Description           | Example                               |
| -------------- | --------------------- | ------------------------------------- |
| `_eq`          | Equal                 | `filter[status][_eq]=published`       |
| `_neq`         | Not equal             | `filter[status][_neq]=draft`          |
| `_gt`          | Greater than          | `filter[price][_gt]=100`              |
| `_gte`         | Greater than or equal | `filter[price][_gte]=100`             |
| `_lt`          | Less than             | `filter[price][_lt]=500`              |
| `_lte`         | Less than or equal    | `filter[price][_lte]=500`             |
| `_in`          | In array              | `filter[category][_in]=tech,business` |
| `_not_in`      | Not in array          | `filter[category][_not_in]=tech`      |
| `_between`     | Between values        | `filter[price][_between]=100,500`     |
| `_is_null`     | Is null               | `filter[deletedAt][_is_null]=true`    |
| `_contains`    | Contains text         | `filter[title][_contains]=hello`      |
| `_starts_with` | Starts with           | `filter[title][_starts_with]=hello`   |
| `_ends_with`   | Ends with             | `filter[title][_ends_with]=world`     |
| `_not`         | Not (group)           | `filter[_not][status][_eq]=draft`     |

### Response Format

#### Success Response

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "Hello World",
      "content": "This is my first post",
      "createdAt": "2025-08-05T03:54:42.610Z",
      "updatedAt": "2025-08-05T03:54:42.610Z"
    }
  ],
  "meta": {
    "totalCount": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

#### Error Response

```json
{
  "success": false,
  "message": "Error message",
  "statusCode": 400,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message",
    "details": null,
    "timestamp": "2025-08-05T03:54:42.610Z",
    "path": "/api/endpoint",
    "method": "GET",
    "correlationId": "req_1754366082608_f1ts2w7za"
  }
}
```

## GraphQL API

### Endpoint

```
http://localhost:1105/graphql
```

### Authentication

Include JWT token in HTTP headers:

```
Authorization: Bearer <your-jwt-token>
```

### Schema

GraphQL schema is automatically generated from table definitions. Each table becomes a type with corresponding queries and mutations.

### Queries

#### List Records

```graphql
query {
  posts(
    filter: { title: { _contains: "hello" } }
    sort: { createdAt: DESC }
    page: 1
    limit: 10
  ) {
    data {
      id
      title
      content
      createdAt
      updatedAt
    }
    meta {
      totalCount
      page
      limit
      totalPages
    }
  }
}
```

#### Get Single Record

```graphql
query {
  post(id: "1") {
    id
    title
    content
    createdAt
    updatedAt
  }
}
```

#### With Relations

```graphql
query {
  posts {
    data {
      id
      title
      content
      author {
        id
        name
        email
      }
      comments {
        id
        content
        user {
          name
        }
      }
    }
  }
}
```

### Mutations

#### Create Record

```graphql
mutation {
  createPost(
    input: { title: "Hello World", content: "This is my first post" }
  ) {
    id
    title
    content
    createdAt
  }
}
```

#### Update Record

```graphql
mutation {
  updatePost(id: "1", input: { title: "Updated Title" }) {
    id
    title
    content
    updatedAt
  }
}
```

#### Delete Record

```graphql
mutation {
  deletePost(id: "1") {
    success
    message
  }
}
```

### Filter Operators (GraphQL)

Same operators as REST API, but in GraphQL format:

```graphql
filter: {
  title: { _contains: "hello" }
  status: { _eq: "published" }
  price: { _between: [100, 500] }
  category: { _in: ["tech", "business"] }
  deletedAt: { _is_null: true }
}
```

## Table Management API

### Create Table

```http
POST /table_definition
```

**Example:**

```bash
curl -X POST http://localhost:1105/table_definition \
  -H "Content-Type: application/json" \
  -d '{
    "name": "posts",
    "columns": [
      {
        "name": "id",
        "type": "int",
        "isPrimary": true,
        "isAutoIncrement": true
      },
      {
        "name": "title",
        "type": "varchar",
        "length": 255,
        "isNullable": false
      },
      {
        "name": "content",
        "type": "text",
        "isNullable": true
      },
      {
        "name": "authorId",
        "type": "int",
        "isNullable": false
      }
    ],
    "relations": [
      {
        "name": "author",
        "type": "many-to-one",
        "targetTable": "users",
        "foreignKey": "authorId"
      }
    ]
  }'
```

### Update Table

```http
PATCH /table_definition/{id}
```

### Delete Table

```http
DELETE /table_definition/{id}
```

### List Tables

```http
GET /table_definition
```

## Custom Handlers

### REST Handler Example

```javascript
// Custom logic for GET /posts
if ($ctx.$user.role !== 'admin') {
  return await $ctx.$repos.posts.find({
    where: {
      authorId: { _eq: $ctx.$user.id },
    },
  });
}

return await $ctx.$repos.posts.find({
  where: $ctx.$args.filter,
});
```

### GraphQL Handler Example

```javascript
// Custom logic for posts query
if ($ctx.$user.role !== 'admin') {
  return await $ctx.$repos.posts.find({
    where: {
      authorId: { _eq: $ctx.$user.id },
    },
  });
}

return await $ctx.$repos.posts.find({
  where: $ctx.$args.filter,
});
```

## Rate Limiting

API endpoints are rate-limited to prevent abuse:

- 100 requests per minute per IP
- 1000 requests per hour per user

## Pagination

### Cursor-based Pagination

```http
GET /posts?cursor=eyJpZCI6MTB9&limit=10
```

### Offset-based Pagination

```http
GET /posts?page=1&limit=10
```

## Field Selection

### REST API

```http
GET /posts?fields=id,title,createdAt
```

### GraphQL

```graphql
query {
  posts {
    data {
      id
      title
      createdAt
    }
  }
}
```

## Aggregate Filters

Aggregate filters allow you to filter records based on aggregate conditions of related records.

### Count Filter

```http
GET /posts?filter[count.comments.id][_gt]=2
```

### Sum Filter

```http
GET /users?filter[sum.orders.total][_gt]=1000
```

### Average Filter

```http
GET /products?filter[avg.reviews.rating][_gte]=4.5
```

### Min/Max Filter

```http
GET /products?filter[min.price][_lt]=100&filter[max.price][_gt]=50
```

**Note**: Aggregate filters work with relations, not direct table fields. The format is `filter[aggregate.relation.field][operator]=value`.

## Error Codes

| Code                     | Description              |
| ------------------------ | ------------------------ |
| `UNAUTHORIZED`           | Authentication required  |
| `FORBIDDEN`              | Insufficient permissions |
| `NOT_FOUND`              | Resource not found       |
| `VALIDATION_ERROR`       | Invalid input data       |
| `BUSINESS_LOGIC_ERROR`   | Business rule violation  |
| `SCRIPT_EXECUTION_ERROR` | Handler script error     |
| `SCRIPT_TIMEOUT_ERROR`   | Handler script timeout   |
| `INTERNAL_SERVER_ERROR`  | Unexpected server error  |

## Schema Synchronization

When you create or modify tables through the `table_definition` API, the system automatically:

1. **Pulls metadata** from the database
2. **Generates TypeScript entities**
3. **Creates and runs migrations**
4. **Reloads the DataSource** with new entities
5. **Reloads GraphQL schema** with new types
6. **Creates a backup** of the current schema

This process is handled by the `syncAll` method in `MetadataSyncService`.

## SDK Examples

### JavaScript/TypeScript

```javascript
import { EnfyraClient } from '@enfyra/sdk';

const client = new EnfyraClient({
  baseUrl: 'http://localhost:1105',
  token: 'your-jwt-token',
});

// List posts
const posts = await client.posts.find({
  filter: { title: { _contains: 'hello' } },
  sort: { createdAt: 'desc' },
  page: 1,
  limit: 10,
});

// Create post
const post = await client.posts.create({
  title: 'Hello World',
  content: 'This is my first post',
});
```

### Python

```python
from enfyra import EnfyraClient

client = EnfyraClient(
    base_url='http://localhost:1105',
    token='your-jwt-token'
)

# List posts
posts = client.posts.find(
    filter={'title': {'_contains': 'hello'}},
    sort={'createdAt': 'desc'},
    page=1,
    limit=10
)

# Create post
post = client.posts.create({
    'title': 'Hello World',
    'content': 'This is my first post'
})
```
