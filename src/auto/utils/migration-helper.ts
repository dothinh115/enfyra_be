import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { Logger } from '@nestjs/common';

const logger = new Logger('MigrationHelper');

export function generateMigrationFile() {
  const migrationDir = path.resolve('src', 'migrations', 'AutoMigration');
  const needDeleteDir = path.resolve('src', 'migrations');
  const appDataSourceDir = path.resolve('src', 'data-source', 'data-source.ts');

  logger.log('Preparing to generate migration file');

  try {
    if (fs.existsSync(needDeleteDir)) {
      fs.rmSync(needDeleteDir, { recursive: true, force: true });
      logger.log(`Successfully deleted directory ${needDeleteDir}`);
    }

    fs.mkdirSync(migrationDir, { recursive: true });
    logger.log(`Successfully created directory ${migrationDir}`);

    const script = `npm run typeorm -- migration:generate ${migrationDir} -d ${appDataSourceDir}`;
    execSync(script, { encoding: 'utf-8' });
    logger.debug('Migration file generation successful!');
  } catch (error: any) {
    const output = error?.output?.[1]?.toString() ?? '';

    logger.error('Error running generate migration:');
    console.error(output);

    if (output.includes('No changes in database schema were found')) {
      logger.warn('⏭️ No changes to generate migration. Skipping.');
      return; // don't throw, to avoid restore loop
    }

    throw error;
  }
}

export function runMigration() {
  const dataSourceDir = path.resolve('src', 'data-source', 'data-source.ts');
  const script = `npm run typeorm -- migration:run -d ${dataSourceDir}`;

  logger.log('Preparing to run migration');
  logger.log(`Script: ${script}`);

  try {
    execSync(script, { stdio: 'inherit' });
    logger.debug('Migration execution successful!');
  } catch (error) {
    logger.error('Error running shell script:', error);
    throw error;
  }
}
