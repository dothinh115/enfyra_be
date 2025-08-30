import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

describe('Minimal E2E Test', () => {
  let app: INestApplication;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    configService = moduleFixture.get<ConfigService>(ConfigService);
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should have app initialized', () => {
    expect(app).toBeDefined();
  });

  it('should have config service', () => {
    expect(configService).toBeDefined();
    expect(configService.get).toBeDefined();
  });

  it('should have NODE_ENV configured', () => {
    const nodeEnv = configService.get('NODE_ENV');
    expect(nodeEnv).toBeDefined();
  });
});
