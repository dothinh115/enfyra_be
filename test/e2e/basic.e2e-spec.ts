import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Basic Functionality (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = moduleFixture.get<DataSource>(DataSource);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Application Health', () => {
    it('should have app initialized', () => {
      expect(app).toBeDefined();
      expect(app.getHttpServer()).toBeDefined();
    });

    it('should have database connection', () => {
      expect(dataSource.isInitialized).toBe(true);
    });
  });

  describe('GraphQL Endpoint', () => {
    it('should respond to GraphQL requests', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: '{ __schema { types { name } } }' });

      expect(response.status).toBe(200);
    });

    it('should handle invalid GraphQL queries gracefully', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: '{ invalidField }' });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for non-existent routes', async () => {
      const response = await request(app.getHttpServer()).get(
        '/non-existent-route'
      );

      expect(response.status).toBe(404);
    });

    it('should handle malformed requests', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ invalid: 'data' });

      expect(response.status).toBe(400);
    });
  });
});
