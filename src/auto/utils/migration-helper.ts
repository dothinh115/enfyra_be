import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '@nestjs/common';

const execAsync = promisify(exec);
const logger = new Logger('MigrationHelper');

export async function generateMigrationFile() {
  await generateMigrationFileDirect();
}

async function generateMigrationFileDirect() {
  const migrationDir = path.resolve('src', 'migrations', 'AutoMigration');
  const needDeleteDir = path.resolve('src', 'migrations');
  const appDataSourceDir = path.resolve('src', 'data-source', 'data-source.ts');

  logger.log('Preparing to generate migration file (direct)');

  try {
    if (fs.existsSync(needDeleteDir)) {
      fs.rmSync(needDeleteDir, { recursive: true, force: true });
      logger.log(`Successfully deleted directory ${needDeleteDir}`);
    }

    fs.mkdirSync(migrationDir, { recursive: true });
    logger.log(`Successfully created directory ${migrationDir}`);

    // Use ts-node to run TypeORM with TypeScript support
    const tsNode = path.resolve('node_modules/.bin/ts-node');
    const typeormCli = path.resolve('node_modules/typeorm/cli.js');
    const script = `${tsNode} ${typeormCli} migration:generate ${migrationDir} -d ${appDataSourceDir}`;
    const { stdout, stderr } = await execAsync(script, {
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' },
    });

    if (stdout) logger.debug(stdout);
    if (
      stderr &&
      !stderr.includes('No changes in database schema were found')
    ) {
      logger.warn(stderr);
    }

    logger.debug('Migration file generation successful!');
  } catch (error: any) {
    const errorMessage = error?.message || '';
    const stdout = error?.stdout || '';
    const stderr = error?.stderr || '';

    logger.error('Error running generate migration:');
    console.error(errorMessage);

    if (
      stdout.includes('No changes in database schema were found') ||
      stderr.includes('No changes in database schema were found') ||
      errorMessage.includes('No changes in database schema were found')
    ) {
      logger.warn('⏭️ No changes to generate migration. Skipping.');
      return; // don't throw, to avoid restore loop
    }

    throw error;
  }
}

export async function runMigration() {
  await runMigrationDirect();
}

async function runMigrationDirect() {
  const dataSourceDir = path.resolve('src', 'data-source', 'data-source.ts');
  const tsNode = path.resolve('node_modules/.bin/ts-node');
  const typeormCli = path.resolve('node_modules/typeorm/cli.js');
  const script = `${tsNode} ${typeormCli} migration:run -d ${dataSourceDir}`;

  logger.log('Preparing to run migration (direct)');
  logger.log(`Script: ${script}`);

  try {
    const { stdout, stderr } = await execAsync(script, {
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' },
    });
    if (stdout) logger.debug(stdout);
    if (stderr) logger.warn(stderr);
    logger.debug('Migration execution successful!');
  } catch (error) {
    logger.error('Error running shell script:', error);
    throw error;
  }
}
