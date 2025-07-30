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
import { GraphqlService } from './graphql/graphql.service';

async function bootstrap() {
  const logger = new Logger('Main');

  const script = `node ${path.resolve(__dirname, '../scripts/init-db.js')}`;
  try {
    execSync(script, { stdio: 'inherit' });
    logger.debug('Build file js thành công');
    buildToJs({
      targetDir: path.resolve('src/entities'),
      outDir: path.resolve('dist/src/entities'),
    });
  } catch (err) {
    logger.error('Lỗi khi chạy shell script:', err);
  }

  const app = await NestFactory.create(AppModule);
  const graphqlService = app.get(GraphqlService);
  const expressApp = app.getHttpAdapter().getInstance();

  expressApp.use('/graphql', (req, res, next) => {
    return graphqlService.getYogaInstance()(req, res, next);
  });
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
