import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as cors from 'cors';
import * as express from 'express';
import * as qs from 'qs';
import { ConfigService } from '@nestjs/config';
async function ensureDatabaseExists() {
  const DB_TYPE = (process.env.DB_TYPE || 'mysql') as 'mysql' | 'postgres';
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT =
    Number(process.env.DB_PORT) || (DB_TYPE === 'postgres' ? 5432 : 3306);
  const DB_USERNAME = process.env.DB_USERNAME || 'root';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const DB_NAME = process.env.DB_NAME || 'dynamiq';

  if (DB_TYPE !== 'mysql') {
    console.log(
      `⚠️ Đang dùng ${DB_TYPE}, bạn phải tạo database '${DB_NAME}' thủ công.`,
    );
    return;
  }

  // Kết nối tạm tới MySQL để kiểm tra/tạo DB
  const tempDataSource = new DataSource({
    type: 'mysql',
    host: DB_HOST,
    port: DB_PORT,
    username: DB_USERNAME,
    password: DB_PASSWORD,
  });

  await tempDataSource.initialize();
  const queryRunner = tempDataSource.createQueryRunner();

  const result = await queryRunner.query(
    `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
    [DB_NAME],
  );
  const dbExists = result.length > 0;

  if (!dbExists) {
    await queryRunner.query(`CREATE DATABASE \`${DB_NAME}\``);
    console.log(`✅ Đã tạo database '${DB_NAME}' (MySQL).`);
  } else {
    console.log(`✅ Database '${DB_NAME}' đã tồn tại (MySQL).`);
  }

  await queryRunner.release();
  await tempDataSource.destroy();
}

async function bootstrap() {
  await ensureDatabaseExists();

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
