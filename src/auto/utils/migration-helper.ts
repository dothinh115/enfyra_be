import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '@nestjs/common';
import { createDataSource } from '../../data-source/data-source';
import { CommonService } from '../../common/common.service';

const logger = new Logger('MigrationHelper');

export async function generateMigrationFile() {
  await generateMigrationFileDirect();
}

async function generateMigrationFileDirect() {
  const migrationDir = path.resolve('dist', 'src', 'migrations', 'AutoMigration');
  const needDeleteDir = path.resolve('dist', 'src', 'migrations');
  const entityDir = path.resolve('dist', 'src', 'entities');

  logger.log('🚀 Generating migration using DataSource API...');

  try {
    // Clean up existing migrations
    if (fs.existsSync(needDeleteDir)) {
      fs.rmSync(needDeleteDir, { recursive: true, force: true });
      logger.log(`Successfully deleted directory ${needDeleteDir}`);
    }

    fs.mkdirSync(migrationDir, { recursive: true });
    logger.log(`Successfully created directory ${migrationDir}`);

    // Load entities and create DataSource
    const commonService = new CommonService();
    const entities = await commonService.loadDynamicEntities(entityDir);
    const dataSource = createDataSource(entities);
    
    await dataSource.initialize();
    logger.debug('✅ DataSource initialized for migration generation');

    // Use TypeORM's migration generator
    const sqlInMemory = await dataSource.driver.createSchemaBuilder().log();
    
    if (sqlInMemory.upQueries.length === 0) {
      logger.warn('⏭️ No changes to generate migration. Skipping.');
      await dataSource.destroy();
      return;
    }

    // Generate migration file as JS (not TS) for direct execution
    const timestamp = Date.now();
    const migrationName = `AutoMigration${timestamp}`;
    const migrationPath = path.join(migrationDir, `${migrationName}.js`);
    
    const upQueries = sqlInMemory.upQueries
      .map(query => {
        // Escape backticks, backslashes, and other problematic characters
        const escapedQuery = query.query
          .replace(/\\/g, '\\\\')  // Escape backslashes first
          .replace(/`/g, '\\`')    // Escape backticks
          .replace(/\${/g, '\\${'); // Escape template literal variables
        return `        await queryRunner.query(\`${escapedQuery}\`);`;
      })
      .join('\n');
      
    const downQueries = sqlInMemory.downQueries
      .map(query => {
        // Escape backticks, backslashes, and other problematic characters  
        const escapedQuery = query.query
          .replace(/\\/g, '\\\\')  // Escape backslashes first
          .replace(/`/g, '\\`')    // Escape backticks
          .replace(/\${/g, '\\${'); // Escape template literal variables
        return `        await queryRunner.query(\`${escapedQuery}\`);`;
      })
      .join('\n');
    
    const migrationTemplate = `const { MigrationInterface } = require("typeorm");

class ${migrationName}${timestamp} {
    name = '${migrationName}${timestamp}'

    async up(queryRunner) {
${upQueries}
    }

    async down(queryRunner) {
${downQueries}
    }
}

module.exports = { ${migrationName}${timestamp} };
`;

    fs.writeFileSync(migrationPath, migrationTemplate);
    logger.log(`✅ Migration file generated: ${migrationPath}`);
    
    await dataSource.destroy();
    logger.debug('✅ Migration file generation successful via DataSource API!');
  } catch (error: any) {
    logger.error('❌ Error in DataSource migration generation:', error);
    throw error;
  }
}

export async function runMigration() {
  await runMigrationDirect();
}

async function runMigrationDirect() {
  const entityDir = path.resolve('dist', 'src', 'entities');
  const migrationDir = path.resolve('dist', 'src', 'migrations');

  logger.log('🚀 Running migration using DataSource API...');

  try {
    // Load entities and create DataSource with proper migration path
    const commonService = new CommonService();
    const entities = await commonService.loadDynamicEntities(entityDir);
    
    // Create DataSource with explicit migration configuration
    const { DataSource } = await import('typeorm');
    const dataSource = new DataSource({
      type: process.env.DB_TYPE as 'mysql',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306'),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      synchronize: false,
      entities,
      migrations: [path.resolve('dist', 'src', 'migrations', '**', '*.js')], // Look for JS files in dist
      migrationsRun: false, // Don't auto-run migrations
      logging: false,
    });
    
    await dataSource.initialize();
    logger.debug('✅ DataSource initialized for migration run');

    // Run pending migrations
    const migrations = await dataSource.runMigrations();
    
    if (migrations.length === 0) {
      logger.log('✅ No pending migrations to run');
    } else {
      logger.log(`✅ Successfully ran ${migrations.length} migration(s):`);
      migrations.forEach(migration => {
        logger.log(`  - ${migration.name}`);
      });
    }
    
    await dataSource.destroy();
    
    // ✅ Clean up migration files after successful execution
    if (fs.existsSync(migrationDir)) {
      fs.rmSync(migrationDir, { recursive: true, force: true });
      logger.log(`🧹 Cleaned up migration directory: ${migrationDir}`);
    }
    
    logger.debug('✅ Migration execution successful via DataSource API!');
  } catch (error) {
    logger.error('❌ Error in DataSource migration run:', error);
    throw error;
  }
}
