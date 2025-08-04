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
  const migrationDir = path.resolve('src', 'migrations', 'AutoMigration');
  const needDeleteDir = path.resolve('src', 'migrations');
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

    // Generate migration file
    const timestamp = Date.now();
    const migrationName = `AutoMigration${timestamp}`;
    const migrationPath = path.join(migrationDir, `${migrationName}.ts`);
    
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
    
    const migrationTemplate = `import { MigrationInterface, QueryRunner } from "typeorm";

export class ${migrationName}${timestamp} implements MigrationInterface {
    name = '${migrationName}${timestamp}'

    public async up(queryRunner: QueryRunner): Promise<void> {
${upQueries}
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
${downQueries}
    }
}
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
  const migrationDir = path.resolve('src', 'migrations');

  logger.log('🚀 Running migration using DataSource API...');

  try {
    // Load entities and create DataSource
    const commonService = new CommonService();
    const entities = await commonService.loadDynamicEntities(entityDir);
    const dataSource = createDataSource(entities);
    
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
    logger.debug('✅ Migration execution successful via DataSource API!');
  } catch (error) {
    logger.error('❌ Error in DataSource migration run:', error);
    throw error;
  }
}
