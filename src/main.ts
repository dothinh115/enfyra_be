import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as cors from 'cors';
import * as express from 'express';
import * as qs from 'qs';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { buildToJs } from './auto/utils/build-helper';
import { GraphqlService } from './graphql/graphql.service';

const execAsync = promisify(exec);

async function bootstrap() {
  const startTime = Date.now();
  const logger = new Logger('Main');
  logger.log('🚀 Starting Cold Start');

  // Sequential initialization - DB init must complete before build
  try {
    // DB initialization first
    const initStart = Date.now();
    const script = `node ${path.resolve(__dirname, '../scripts/init-db.js')}`;
    await execAsync(script);
    logger.log(`⏱️  DB Init: ${Date.now() - initStart}ms`);
    
    // Build JS entities after DB is ready
    const buildStart = Date.now();
    await buildToJs({
      targetDir: path.resolve('src/entities'),
      outDir: path.resolve('dist/src/entities'),
    });
    logger.log(`⏱️  Build JS: ${Date.now() - buildStart}ms`);
  } catch (err) {
    logger.error('Error during initialization:', err);
  }

  const nestStart = Date.now();
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'], // Reduce logging overhead
    bufferLogs: true, // Buffer logs during initialization
  });
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

  // Initialize app (triggers onApplicationBootstrap)
  const initStart = Date.now();
  await app.init();
  logger.log(`⏱️  App Init (Bootstrap): ${Date.now() - initStart}ms`);
  
  // Start listening
  const listenStart = Date.now();
  await app.listen(configService.get('PORT') || 1105);
  logger.log(`⏱️  HTTP Listen: ${Date.now() - listenStart}ms`);
  
  const totalTime = Date.now() - startTime;
  logger.log(`🎉 Cold Start completed! Total time: ${totalTime}ms`);
}
bootstrap();
