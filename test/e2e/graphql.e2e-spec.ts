import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('GraphQL (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = moduleFixture.get<DataSource>(DataSource);
    await app.init();

    // Login để lấy auth token
    try {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'enfyra@admin.com', password: '1234' });
      authToken = loginResponse.body.accessToken;
    } catch (error) {
      console.warn('⚠️  Could not login, tests may fail:', error.message);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GraphQL Endpoint', () => {
    it('should access GraphQL endpoint', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: '{ __schema { types { name } } }' });

      expect(response.status).toBe(200);
    });

    it('should handle introspection query', async () => {
      const introspectionQuery = `
        query IntrospectionQuery {
          __schema {
            queryType {
              name
            }
            mutationType {
              name
            }
            subscriptionType {
              name
            }
            types {
              ...FullType
            }
          }
        }

        fragment FullType on __Type {
          name
          description
          fields(includeDeprecated: true) {
            name
            description
            args {
              ...InputValue
            }
            type {
              ...TypeRef
            }
            isDeprecated
            deprecationReason
          }
        }

        fragment InputValue on __InputValue {
          name
          description
          type { ...TypeRef }
          defaultValue
        }

        fragment TypeRef on __Type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType {
                      kind
                      name
                      ofType {
                        kind
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: introspectionQuery });

      expect(response.status).toBe(200);
      expect(response.body.data.__schema).toBeDefined();
    });
  });

  describe('Dynamic Table Queries', () => {
    it('should query dynamic table via GraphQL', async () => {
      if (!authToken) {
        console.warn('⚠️  Skipping test - no auth token');
        return;
      }

      // First create a test table
      const tableDef = {
        name: 'test_graphql_e2e',
        columns: [
          { name: 'id', type: 'int', isPrimary: true, isAutoIncrement: true },
          { name: 'title', type: 'varchar', length: 255, isNullable: false },
          { name: 'content', type: 'text' },
          { name: 'status', type: 'varchar', length: 50, default: 'active' },
        ],
      };

      await request(app.getHttpServer())
        .post('/table_definition')
        .set('Authorization', `Bearer ${authToken}`)
        .send(tableDef);

      // Create test data
      const postData = {
        title: 'GraphQL Test Post',
        content: 'This is a test post for GraphQL e2e testing',
        status: 'active',
      };

      await request(app.getHttpServer())
        .post('/test_graphql_e2e')
        .set('Authorization', `Bearer ${authToken}`)
        .send(postData);

      // Query via GraphQL
      const graphqlQuery = `
        query {
          test_graphql_e2e {
            data {
              id
              title
              content
              status
            }
            meta {
              totalCount
            }
          }
        }
      `;

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ query: graphqlQuery });

      expect(response.status).toBe(200);
      expect(response.body.data.test_graphql_e2e.data).toHaveLength(1);
      expect(response.body.data.test_graphql_e2e.data[0].title).toBe(
        'GraphQL Test Post'
      );

      // Cleanup
      const allPosts = await request(app.getHttpServer())
        .get('/test_graphql_e2e')
        .set('Authorization', `Bearer ${authToken}`);

      for (const post of allPosts.body.data) {
        await request(app.getHttpServer())
          .delete(`/test_graphql_e2e/${post.id}`)
          .set('Authorization', `Bearer ${authToken}`);
      }
    });

    it('should handle GraphQL mutations', async () => {
      if (!authToken) {
        console.warn('⚠️  Skipping test - no auth token');
        return;
      }

      const mutationQuery = `
        mutation CreatePost($input: CreatePostInput!) {
          createPost(input: $input) {
            id
            title
            content
            status
          }
        }
      `;

      const variables = {
        input: {
          title: 'Mutation Test Post',
          content: 'Testing GraphQL mutations',
          status: 'draft',
        },
      };

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: mutationQuery,
          variables,
        });

      // Note: This test may fail if mutations aren't implemented yet
      // It's here to show the expected structure
      expect(response.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid GraphQL queries', async () => {
      const invalidQuery = `
        query {
          nonExistentTable {
            id
          }
        }
      `;

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: invalidQuery });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
    });

    it('should handle malformed GraphQL requests', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ invalid: 'data' });

      expect(response.status).toBe(400);
    });
  });
});
