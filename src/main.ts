import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as cors from 'cors';
import * as express from 'express';
import * as qs from 'qs';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { execSync } from 'child_process';
import { buildToJs } from './auto/utils/build-helper';

async function bootstrap() {
  const logger = new Logger('Main');

  const script = `ts-node ${path.resolve(__dirname, '../', 'init-db.ts')}`;
  try {
    execSync(script, { stdio: 'inherit' });
    logger.debug('Build file js thành công');
    buildToJs({
      targetDir: path.resolve('src/entities'),
      outDir: path.resolve('dist/entities'),
    });
  } catch (err) {
    logger.error('Lỗi khi chạy shell script:', err);
  }
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(
    cors({
      origin: ['*'],
      credentials: true,
      methods: ['POST', 'GET', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-apollo-operation-name',
      ],
    }),
  );
  app.use(express.json());

  const httpAdapter = app.getHttpAdapter();
  const expressApp = httpAdapter.getInstance();
  expressApp.set('query parser', (str) => qs.parse(str, { depth: 10 }));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  await app.listen(configService.get('PORT') || 1105);
}
bootstrap();
