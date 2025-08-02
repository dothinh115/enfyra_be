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
  const startTime = Date.now();
  const logger = new Logger('Main');
  logger.log('🚀 Starting Cold Start');

  const script = `node ${path.resolve(__dirname, '../scripts/init-db.js')}`;
  try {
    const initStart = Date.now();
    execSync(script, { stdio: 'inherit' });
    logger.log(`⏱️  DB Init: ${Date.now() - initStart}ms`);
    
    const buildStart = Date.now();
    logger.debug('JavaScript file build successful');
    buildToJs({
      targetDir: path.resolve('src/entities'),
      outDir: path.resolve('dist/src/entities'),
    });
    logger.log(`⏱️  Build JS: ${Date.now() - buildStart}ms`);
  } catch (err) {
    logger.error('Error running shell script:', err);
  }

  const nestStart = Date.now();
  const app = await NestFactory.create(AppModule);
  logger.log(`⏱️  NestJS Create: ${Date.now() - nestStart}ms`);
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

  const listenStart = Date.now();
  await app.listen(configService.get('PORT') || 1105);
  logger.log(`⏱️  App Listen: ${Date.now() - listenStart}ms`);
  
  const totalTime = Date.now() - startTime;
  logger.log(`🎉 Cold Start completed! Total time: ${totalTime}ms`);
}
bootstrap();
