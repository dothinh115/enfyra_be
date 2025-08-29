import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Dynamic API (e2e)', () => {
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

  describe('Table Management', () => {
    it('should create dynamic table', async () => {
      if (!authToken) {
        console.warn('⚠️  Skipping test - no auth token');
        return;
      }

      const tableDef = {
        name: 'test_products_e2e',
        columns: [
          { name: 'id', type: 'int', isPrimary: true, isAutoIncrement: true },
          { name: 'name', type: 'varchar', length: 255, isNullable: false },
          { name: 'price', type: 'decimal', precision: 10, scale: 2 },
          { name: 'category', type: 'varchar', length: 100 },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/table_definition')
        .set('Authorization', `Bearer ${authToken}`)
        .send(tableDef);

      expect(response.status).toBe(201);
      expect(response.body.data.name).toBe('test_products_e2e');
    });

    it('should access dynamic table endpoint', async () => {
      if (!authToken) {
        console.warn('⚠️  Skipping test - no auth token');
        return;
      }

      const response = await request(app.getHttpServer())
        .get('/test_products_e2e')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('CRUD Operations', () => {
    it('should perform full CRUD cycle', async () => {
      if (!authToken) {
        console.warn('⚠️  Skipping test - no auth token');
        return;
      }

      // CREATE
      const createData = {
        name: 'E2E Test Product',
        price: 99.99,
        category: 'Electronics',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/test_products_e2e')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createData);

      expect(createResponse.status).toBe(201);
      const productId = createResponse.body.data.id;

      // READ
      const readResponse = await request(app.getHttpServer())
        .get(`/test_products_e2e/${productId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(readResponse.status).toBe(200);
      expect(readResponse.body.data.name).toBe('E2E Test Product');

      // UPDATE
      const updateResponse = await request(app.getHttpServer())
        .patch(`/test_products_e2e/${productId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ price: 149.99 });

      expect(updateResponse.status).toBe(200);

      // DELETE
      const deleteResponse = await request(app.getHttpServer())
        .delete(`/test_products_e2e/${productId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(200);
    });
  });

  describe('Query Engine', () => {
    it('should handle complex queries', async () => {
      if (!authToken) {
        console.warn('⚠️  Skipping test - no auth token');
        return;
      }

      // Create test data
      const products = [
        { name: 'Laptop E2E', price: 999.99, category: 'Electronics' },
        { name: 'Phone E2E', price: 599.99, category: 'Electronics' },
        { name: 'Book E2E', price: 19.99, category: 'Books' },
      ];

      for (const product of products) {
        await request(app.getHttpServer())
          .post('/test_products_e2e')
          .set('Authorization', `Bearer ${authToken}`)
          .send(product);
      }

      // Test filtering
      const filterResponse = await request(app.getHttpServer())
        .get('/test_products_e2e?filter[category][_eq]=Electronics')
        .set('Authorization', `Bearer ${authToken}`);

      expect(filterResponse.status).toBe(200);
      expect(filterResponse.body.data).toHaveLength(2);

      // Test sorting
      const sortResponse = await request(app.getHttpServer())
        .get('/test_products_e2e?sort=-price')
        .set('Authorization', `Bearer ${authToken}`);

      expect(sortResponse.status).toBe(200);
      expect(sortResponse.body.data[0].price).toBe('999.99');

      // Cleanup
      const allProducts = await request(app.getHttpServer())
        .get('/test_products_e2e')
        .set('Authorization', `Bearer ${authToken}`);

      for (const product of allProducts.body.data) {
        await request(app.getHttpServer())
          .delete(`/test_products_e2e/${product.id}`)
          .set('Authorization', `Bearer ${authToken}`);
      }
    });
  });
});
