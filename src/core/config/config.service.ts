import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
  poolSize: number;
  acquireTimeout: number;
  timeout: number;
  extra: {
    connectionLimit: number;
    acquireTimeout: number;
    timeout: number;
    idleTimeout: number;
  };
}

export interface RedisConfig {
  uri: string;
  ttl: number;
  maxConnections: number;
  minConnections: number;
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
  healthCheckInterval: number;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshExpiresIn: string;
  issuer: string;
  audience: string;
}

export interface SecurityConfig {
  bcryptRounds: number;
  rateLimitWindow: number;
  rateLimitMax: number;
  corsOrigins: string[];
  corsCredentials: boolean;
}

export interface FileUploadConfig {
  maxFileSize: number;
  allowedMimeTypes: string[];
  uploadPath: string;
  tempPath: string;
}

export interface LoggingConfig {
  level: string;
  format: string;
  enableConsole: boolean;
  enableFile: boolean;
  logFilePath: string;
  maxLogSize: string;
  maxLogFiles: number;
}

export interface AppConfig {
  port: number;
  environment: string;
  apiPrefix: string;
  enableSwagger: boolean;
  enableGraphQL: boolean;
  enableHealthCheck: boolean;
}

export interface AppConfiguration {
  database: DatabaseConfig;
  redis: RedisConfig;
  jwt: JwtConfig;
  security: SecurityConfig;
  fileUpload: FileUploadConfig;
  logging: LoggingConfig;
  app: AppConfig;
}

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: NestConfigService) {}

  /**
   * Get database configuration
   */
  get database(): DatabaseConfig {
    return {
      host: this.configService.get('DB_HOST', 'localhost'),
      port: this.configService.get('DB_PORT', 3306),
      username: this.configService.get('DB_USERNAME', 'root'),
      password: this.configService.get('DB_PASSWORD', ''),
      database: this.configService.get('DB_NAME', 'enfyra'),
      synchronize: this.configService.get('DB_SYNC', false),
      logging: this.configService.get('DB_LOGGING', false),
      poolSize: this.configService.get('DB_POOL_SIZE', 2),
      acquireTimeout: this.configService.get('DB_ACQUIRE_TIMEOUT', 10000),
      timeout: this.configService.get('DB_TIMEOUT', 5000),
      extra: {
        connectionLimit: this.configService.get('DB_CONNECTION_LIMIT', 2),
        acquireTimeout: this.configService.get('DB_ACQUIRE_TIMEOUT', 10000),
        timeout: this.configService.get('DB_TIMEOUT', 5000),
        idleTimeout: this.configService.get('DB_IDLE_TIMEOUT', 10000),
      },
    };
  }

  /**
   * Get Redis configuration
   */
  get redis(): RedisConfig {
    return {
      uri: this.configService.get('REDIS_URI', 'redis://localhost:6379'),
      ttl: this.configService.get('DEFAULT_TTL', 300),
      maxConnections: this.configService.get('REDIS_MAX_CONNECTIONS', 5),
      minConnections: this.configService.get('REDIS_MIN_CONNECTIONS', 1),
      maxRetriesPerRequest: 1,
      retryDelayOnFailover: 25,
      healthCheckInterval: 120000,
    };
  }

  /**
   * Get JWT configuration
   */
  get jwt(): JwtConfig {
    return {
      secret: this.configService.get('SECRET_KEY', 'my_secret'),
      expiresIn: this.configService.get('ACCESS_TOKEN_EXP', '15m'),
      refreshExpiresIn: this.configService.get(
        'REFRESH_TOKEN_REMEMBER_EXP',
        '7d'
      ),
      issuer: 'enfyra-be',
      audience: 'enfyra-app',
    };
  }

  /**
   * Get security configuration
   */
  get security(): SecurityConfig {
    return {
      bcryptRounds: this.configService.get('SALT_ROUNDS', 6),
      rateLimitWindow: 300000,
      rateLimitMax: 30,
      corsOrigins: this.configService
        .get('CORS_ORIGINS', 'http://localhost:3000')
        .split(','),
      corsCredentials: this.configService.get('CORS_CREDENTIALS', true),
    };
  }

  /**
   * Get file upload configuration
   */
  get fileUpload(): FileUploadConfig {
    return {
      maxFileSize: 10485760,
      allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/pdf',
        'text/plain',
      ],
      uploadPath: './uploads',
      tempPath: './temp',
    };
  }

  /**
   * Get logging configuration
   */
  get logging(): LoggingConfig {
    return {
      level: this.configService.get('LOG_LEVEL', 'error'),
      format: 'json',
      enableConsole: this.configService.get('LOG_ENABLE_CONSOLE', false),
      enableFile: this.configService.get('LOG_ENABLE_FILE', false),
      logFilePath: './logs/app.log',
      maxLogSize: '5m',
      maxLogFiles: 3,
    };
  }

  /**
   * Get application configuration
   */
  get app(): AppConfig {
    return {
      port: this.configService.get('PORT', 1105),
      environment: this.configService.get('NODE_ENV', 'development'),
      apiPrefix: '/api',
      enableSwagger: false,
      enableGraphQL: this.configService.get('ENABLE_GRAPHQL', false),
      enableHealthCheck: false,
    };
  }

  /**
   * Get entire configuration object
   */
  get config(): AppConfiguration {
    return {
      database: this.database,
      redis: this.redis,
      jwt: this.jwt,
      security: this.security,
      fileUpload: this.fileUpload,
      logging: this.logging,
      app: this.app,
    };
  }

  /**
   * Get environment variable with fallback
   */
  getEnv(key: string, fallback?: any): any {
    return this.configService.get(key, fallback);
  }

  /**
   * Check if current environment is production
   */
  get isProduction(): boolean {
    return this.app.environment === 'production';
  }

  /**
   * Check if current environment is development
   */
  get isDevelopment(): boolean {
    return this.app.environment === 'development';
  }

  /**
   * Check if current environment is test
   */
  get isTest(): boolean {
    return this.app.environment === 'test';
  }

  /**
   * Get database connection string
   */
  getDatabaseConnectionString(): string {
    const { host, port, username, password, database } = this.database;
    return `mysql://${username}:${password}@${host}:${port}/${database}`;
  }

  /**
   * Get Redis connection options
   */
  getRedisConnectionOptions() {
    const {
      uri,
      ttl,
      maxConnections,
      minConnections,
      maxRetriesPerRequest,
      retryDelayOnFailover,
      healthCheckInterval,
    } = this.redis;

    return {
      config: {
        url: uri,
        ttl,
        maxRetriesPerRequest: 2,
        retryDelayOnFailover,
        enableReadyCheck: false,
        maxLoadingTimeout: 2000,
        lazyConnect: true,
        maxConnections,
        minConnections,
        healthCheck: false,
        healthCheckInterval: 0,
        retryDelayOnClusterDown: 50,
      },
    };
  }

  /**
   * Get JWT module options
   */
  getJwtModuleOptions() {
    const { secret, expiresIn, refreshExpiresIn, issuer, audience } = this.jwt;

    return {
      secret,
      signOptions: {
        expiresIn,
        issuer,
        audience,
      },
      refreshOptions: {
        expiresIn: refreshExpiresIn,
        issuer,
        audience,
      },
    };
  }

  /**
   * Validate configuration
   */
  validateConfig(): boolean {
    try {
      // Check required configurations
      if (
        !this.jwt.secret ||
        this.jwt.secret === 'your-super-secret-key-change-in-production'
      ) {
        throw new Error('JWT_SECRET must be set in production environment');
      }

      if (this.isProduction && this.database.synchronize) {
        throw new Error('Database synchronize should be false in production');
      }

      if (this.isProduction && this.app.enableSwagger) {
        throw new Error('Swagger should be disabled in production');
      }

      return true;
    } catch (error) {
      console.error(
        'Configuration validation failed:',
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }
}
