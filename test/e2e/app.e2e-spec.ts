import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('AppController (e2e)', () => {
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

  it('/graphql (POST) - should access GraphQL endpoint', () => {
    return request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ __schema { types { name } } }' })
      .expect(200);
  });

  it('should have database connection', () => {
    expect(dataSource.isInitialized).toBe(true);
  });

  it('should have app initialized', () => {
    expect(app).toBeDefined();
    expect(app.getHttpServer()).toBeDefined();
  });
});
