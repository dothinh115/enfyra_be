import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';

describe('Simple E2E Test', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should have app initialized', () => {
    expect(app).toBeDefined();
    expect(app.getHttpServer).toBeDefined();
  });

  it('should have HTTP server', () => {
    const httpServer = app.getHttpServer();
    expect(httpServer).toBeDefined();
  });
});
