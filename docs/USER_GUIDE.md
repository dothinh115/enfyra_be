# User Guide

## Overview

Enfyra Backend is an API-first platform that allows you to create and manage API endpoints, database schemas, and business logic without writing code. The system automatically generates REST API and GraphQL API based on your configuration.

## Quick Start

### 1. Login to System

```bash
# Login to get token
curl -X POST http://localhost:1105/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "enfyra@admin.com",
    "password": "1234"
  }'
```

**Result:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "email": "admin@example.com",
      "role": "admin"
    }
  }
}
```

### 2. Use Token for Other APIs

```bash
# Save token to variable
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Use token in requests
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:1105/posts
```

## Create Data Tables

### Create Simple Table

```bash
# Create "products" table with basic columns
curl -X POST http://localhost:1105/table_definition \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "products",
    "columns": [
      {
        "name": "id",
        "type": "int",
        "isPrimary": true,
        "isAutoIncrement": true
      },
      {
        "name": "name",
        "type": "varchar",
        "length": 255,
        "isNullable": false
      },
      {
        "name": "price",
        "type": "decimal",
        "precision": 10,
        "scale": 2
      },
      {
        "name": "description",
        "type": "text"
      },
      {
        "name": "createdAt",
        "type": "datetime"
      }
    ]
  }'
```

### Create Table with Relations

```bash
# Create "categories" table first
curl -X POST http://localhost:1105/table_definition \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "categories",
    "columns": [
      {
        "name": "id",
        "type": "int",
        "isPrimary": true,
        "isAutoIncrement": true
      },
      {
        "name": "name",
        "type": "varchar",
        "length": 255
      }
    ]
  }'

# Create "products" table with relation to "categories"
curl -X POST http://localhost:1105/table_definition \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "products",
    "columns": [
      {
        "name": "id",
        "type": "int",
        "isPrimary": true,
        "isAutoIncrement": true
      },
      {
        "name": "name",
        "type": "varchar",
        "length": 255
      },
      {
        "name": "price",
        "type": "decimal",
        "precision": 10,
        "scale": 2
      },
      {
        "name": "categoryId",
        "type": "int"
      }
    ],
    "relations": [
      {
        "name": "category",
        "type": "many-to-one",
        "targetTable": "categories",
        "foreignKey": "categoryId"
      }
    ]
  }'
```

## Data Operations

### 1. Create Data (CREATE)

```bash
# Create new product
curl -X POST http://localhost:1105/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "iPhone 15",
    "price": 999.99,
    "description": "Latest iPhone model"
  }'
```

### 2. Read Data (READ)

#### Get All Products

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:1105/products
```

#### Get Product by ID

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:1105/products/1
```

#### Get Product with Relations

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/products?include=category"
```

### 3. Update Data (UPDATE)

```bash
# Update product
curl -X PATCH http://localhost:1105/products/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "price": 899.99
  }'
```

### 4. Delete Data (DELETE)

```bash
# Delete product
curl -X DELETE http://localhost:1105/products/1 \
  -H "Authorization: Bearer $TOKEN"
```

## Filter and Search Data

### Basic Filter Operators

#### Exact Search

```bash
# Find products with exact name
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/products?filter[name][_eq]=iPhone 15"
```

#### Contains Search

```bash
# Find products with name containing "iPhone"
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/products?filter[name][_contains]=iPhone"
```

#### Range Search

```bash
# Find products with price between 500 and 1000
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/products?filter[price][_between]=500,1000"
```

#### List Search

```bash
# Find products with name in list
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/products?filter[name][_in]=iPhone 15,iPhone 14,Samsung Galaxy"
```

### Combine Multiple Conditions

```bash
# Find products with price > 500 and name containing "iPhone"
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/products?filter[price][_gt]=500&filter[name][_contains]=iPhone"
```

## Sort Data

### Sort by Single Column

```bash
# Sort by price ascending
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/products?sort[price]=asc"

# Sort by price descending
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/products?sort[price]=desc"
```

### Sort by Multiple Columns

```bash
# Sort by category first, then by price
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/products?sort[categoryId]=asc&sort[price]=desc"
```

## Pagination

### Basic Pagination

```bash
# Get first page, 10 products per page
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/products?page=1&limit=10"

# Get second page
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/products?page=2&limit=10"
```

### Get All Data

```bash
# Get all products (no pagination)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/products?limit=0"
```

## Select Specific Fields

```bash
# Get only ID and product name
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/products?fields=id,name"

# Get ID, name, price and category
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/products?fields=id,name,price,category"
```

## Using GraphQL

### Basic Query

```bash
# Query all posts
curl -X POST http://localhost:1105/graphql \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { posts { data { id title content createdAt updatedAt } } }"
  }'
```

### Query with Filter

```bash
# Query posts with title containing "hello"
curl -X POST http://localhost:1105/graphql \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { posts(filter: { title: { _contains: \"hello\" } }) { data { id title content createdAt updatedAt } } }"
  }'
```

### Query with Relations

```bash
# Query posts with user information (if relation exists)
curl -X POST http://localhost:1105/graphql \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { posts { data { id title content createdAt updatedAt user { id email } } } }"
  }'
```

**Note**: GraphQL schema includes all fields including timestamp fields (createdAt, updatedAt) that are automatically generated by TypeORM.

**Note**: GraphQL schema is automatically generated and reloaded when tables are created or modified through the `table_definition` API. The system runs `syncAll` internally to update the schema.

## Add Sample Data

### Create Multiple Posts at Once

```bash
# Create post list
for i in {1..10}; do
  curl -X POST http://localhost:1105/posts \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"title\": \"Post $i\",
      \"content\": \"Content for post $i - $(date)\"
    }"
done
```

### Create Data from JSON File

```bash
# Create posts.json file
cat > posts.json << 'EOF'
[
  {
    "title": "Getting Started with Enfyra",
    "content": "Learn how to use the Enfyra platform for building dynamic APIs"
  },
  {
    "title": "Advanced Filtering Techniques",
    "content": "Explore advanced filtering and querying capabilities"
  },
  {
    "title": "GraphQL Integration Guide",
    "content": "Complete guide to using GraphQL with Enfyra"
  }
]
EOF

# Import data
while IFS= read -r line; do
  curl -X POST http://localhost:1105/posts \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$line"
done < posts.json
```

## Table Management

### View Table List

```bash
# Get list of all tables
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:1105/table_definition
```

### View Table Structure

```bash
# Get detailed information of "posts" table
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:1105/table_definition/11
```

### Update Table Structure

```bash
# Add new column to table
curl -X PATCH http://localhost:1105/table_definition/11 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
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
        "length": 255
      },
      {
        "name": "content",
        "type": "text"
      },
      {
        "name": "author",
        "type": "varchar",
        "length": 100
      }
    ]
  }'
```

### Delete Table

```bash
# Delete Table (cẩn thận - sẽ mất tất cả dữ liệu)
curl -X DELETE http://localhost:1105/table_definition/11 \
  -H "Authorization: Bearer $TOKEN"
```

## Statistics and Reports

### Get Record Count

```bash
# Get total count of posts
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/posts?meta=totalCount&limit=0"
```

### Filter by Count Condition

```bash
# Get posts where related records count > 2 (example with relations)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/posts?filter[count.posts.id][_gt]=2"
```

### Filter by Aggregate Conditions

```bash
# Filter posts where related records count > 2 (example with relations)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/posts?filter[count.posts.id][_gt]=2"

# Filter posts where related records sum > 100 (example with numeric relations)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/posts?filter[sum.comments.id][_gt]=100"
```

**Note**:

- Use `meta=totalCount` to get record counts
- Use `aggregate[count/sum/avg]` in filters to filter by aggregate conditions of related records
- Aggregate functions work with relations, not direct table fields

## Common Error Handling

### Authentication Error

```json
{
  "success": false,
  "message": "Unauthorized",
  "statusCode": 401,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  }
}
```

**How to fix:**

- Check if token is correct
- Check if token has expired
- Login again to get new token

### Not Found Error

```json
{
  "success": false,
  "message": "Resource not found",
  "statusCode": 404,
  "error": {
    "code": "NOT_FOUND",
    "message": "Post with id 999 not found"
  }
}
```

**How to fix:**

- Check if ID exists
- Check if table name is correct

### Validation Error

```json
{
  "success": false,
  "message": "Validation failed",
  "statusCode": 400,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Title cannot be empty"
  }
}
```

**How to fix:**

- Check data format
- Check required fields
- Check length limits

## Usage Tips

### 1. Use jq to process JSON

```bash
# Install jq
# macOS: brew install jq
# Ubuntu: sudo apt install jq

# Get only post titles
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:1105/posts | jq '.data[].title'

# Filter posts by title containing "test"
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:1105/posts | jq '.data[] | select(.title | contains("test"))'
```

### 2. Create aliases for common commands

```bash
# Thêm vào ~/.bashrc hoặc ~/.zshrc
alias enfyra-login='curl -X POST http://localhost:1105/auth/login -H "Content-Type: application/json" -d '"'"'{"email": "enfyra@admin.com", "password": "1234"}'"'"' | jq -r ".accessToken"'

alias enfyra-posts='curl -H "Authorization: Bearer $(enfyra-login)" http://localhost:1105/posts'
```

### 3. Use scripts for automation

```bash
#!/bin/bash
# script.sh

# Login and get token
TOKEN=$(curl -s -X POST http://localhost:1105/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "enfyra@admin.com", "password": "1234"}' | \
  jq -r '.accessToken')

# Create post
curl -X POST http://localhost:1105/posts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New Post",
    "content": "Created by script"
  }'

# Get post list
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:1105/posts | jq '.data'
```

## Real Examples

### Blog Management System

```bash
# 1. Create users table
curl -X POST http://localhost:1105/table_definition \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "users",
    "columns": [
      {"name": "id", "type": "int", "isPrimary": true, "isAutoIncrement": true},
      {"name": "email", "type": "varchar", "length": 255},
      {"name": "name", "type": "varchar", "length": 255}
    ]
  }'

# 2. Create comments table
curl -X POST http://localhost:1105/table_definition \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "comments",
    "columns": [
      {"name": "id", "type": "int", "isPrimary": true, "isAutoIncrement": true},
      {"name": "content", "type": "text"},
      {"name": "postId", "type": "int"},
      {"name": "userId", "type": "int"}
    ],
    "relations": [
      {
        "name": "post",
        "type": "many-to-one",
        "targetTable": "posts",
        "foreignKey": "postId"
      },
      {
        "name": "user",
        "type": "many-to-one",
        "targetTable": "users",
        "foreignKey": "userId"
      }
    ]
  }'

# 3. Add Sample Data
curl -X POST http://localhost:1105/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com", "name": "John Doe"}'

curl -X POST http://localhost:1105/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Great post!",
    "postId": 1,
    "userId": 1
  }'

# 4. Query data
# Get posts with comments
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/posts?include=comments"

# Get posts with comment count > 0
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:1105/posts?filter[count.comments.id][_gt]=0"
```

## Support

If you encounter problems using the system:

1. **Check logs**: View server logs to find errors
2. **Check connection**: Ensure server is running
3. **Check permissions**: Ensure you have access rights
4. **Contact admin**: If still cannot resolve

---

_This guide was last updated: August 2025_
