// src/data-source.ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

export const createDataSource: (entities: any[]) => DataSource = (
  entities: any[],
) => {
  return new DataSource({
    type: process.env.DB_TYPE as 'mysql',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    synchronize: false,
    logging: false,
    entities,
    migrations: [
      path.resolve(__dirname, '..', '..', 'src', 'migrations', '*.js'),
    ],
    migrationsTableName: 'migrations',
  });
};

export const AppDataSource = new DataSource({
  type: process.env.DB_TYPE as 'mysql',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false,
  logging: false,
  entities: [
    path.resolve(
      __dirname,
      '..',
      '..',
      'dist',
      'dynamic-entities',
      '*.entity.js',
    ),
  ],
  migrations: [path.resolve(__dirname, '..', 'migrations', '*.{js,ts}')],
  migrationsTableName: 'migrations',
});
