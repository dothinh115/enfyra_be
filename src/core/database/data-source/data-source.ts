import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// Base data source instance
export const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'enfyra',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: [],
  migrations: [],
  subscribers: [],

  // Connection pool optimization for cost reduction
  extra: {
    // Reduce connection pool size to minimize database costs
    connectionLimit: parseInt(process.env.DB_POOL_SIZE || '5'),
    acquireTimeout: 60000,
    timeout: 60000,
    // Enable connection reuse
    multipleStatements: true,
    // Optimize for read-heavy workloads
    charset: 'utf8mb4',
    collation: 'utf8mb4_unicode_ci',
  },

  // Query optimization
  maxQueryExecutionTime: 10000, // Log slow queries (>10s)

  // Cache optimization
  cache: {
    duration: 30000, // 30 seconds cache
    ignoreErrors: true,
  },

  // Performance tuning
  dropSchema: false,

  // SSL configuration for production
  ssl:
    process.env.NODE_ENV === 'production'
      ? {
          rejectUnauthorized: false,
        }
      : false,
});

// Factory function for creating data sources with custom entities
export const createDataSource: (entities: any[]) => DataSource = (
  entities: any[]
) => {
  const dbType = process.env.DB_TYPE as 'mysql' | 'mariadb' | 'postgres';

  // Base configuration for all database types
  const baseConfig = {
    type: dbType || 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'enfyra',
    synchronize: false,
    entities,
    migrations: [path.resolve('src', 'core', 'database', 'migrations', '*.js')],
    logging: process.env.DB_LOGGING === 'true',

    // Connection pooling optimization for performance
    poolSize: parseInt(process.env.DB_POOL_SIZE || '2'),
    acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '10000'),
    timeout: parseInt(process.env.DB_TIMEOUT || '5000'),
  };

  // Database-specific configuration
  if (dbType === 'mysql' || dbType === 'mariadb') {
    return new DataSource({
      ...baseConfig,
      extra: {
        connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '2'),
        acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '10000'),
        timeout: parseInt(process.env.DB_TIMEOUT || '5000'),
        idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '10000'),
      },
    });
  }

  if (dbType === 'postgres') {
    return new DataSource({
      ...baseConfig,
      acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '30000'),
      extra: {
        max: parseInt(process.env.DB_CONNECTION_LIMIT || '2'),
        connectionTimeoutMillis: parseInt(
          process.env.DB_ACQUIRE_TIMEOUT || '10000'
        ),
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '10000'),
      },
    });
  }

  // Fallback for unsupported database types
  return new DataSource(baseConfig);
};
