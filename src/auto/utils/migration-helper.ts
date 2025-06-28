import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { Logger } from '@nestjs/common';

const logger = new Logger('MigrationHelper');

export function generateMigrationFile() {
  const migrationDir = path.resolve('src', 'migrations', 'AutoMigration');
  const needDeleteDir = path.resolve('src', 'migrations');
  const appDataSourceDir = path.resolve('src', 'data-source', 'data-source.ts');

  logger.log('Chuẩn bị generate file migration');

  try {
    if (fs.existsSync(needDeleteDir)) {
      fs.rmSync(needDeleteDir, { recursive: true, force: true });
      logger.log(`Đã xoá sạch thư mục ${needDeleteDir}`);
    }

    fs.mkdirSync(migrationDir, { recursive: true });
    logger.log(`Đã tạo thư mục ${migrationDir}`);

    const script = `npm run typeorm -- migration:generate ${migrationDir} -d ${appDataSourceDir}`;
    execSync(script, { encoding: 'utf-8' });
    logger.debug('Generate file migration thành công!');
  } catch (error: any) {
    const output = error?.output?.[1]?.toString() ?? '';

    logger.error('Lỗi khi chạy generate migration:');
    console.error(output);

    if (output.includes('No changes in database schema were found')) {
      logger.warn('⏭️ Không có gì thay đổi để generate migration. Bỏ qua.');
      return; // không throw, để tránh loop restore
    }

    throw error;
  }
}

export function runMigration() {
  const dataSourceDir = path.resolve('src', 'data-source', 'data-source.ts');
  const script = `npm run typeorm -- migration:run -d ${dataSourceDir}`;

  logger.log('Chuẩn bị run migration');
  logger.log(`Script: ${script}`);

  try {
    execSync(script, { stdio: 'inherit' });
    logger.debug('Run migration thành công!');
  } catch (error) {
    logger.error('Lỗi khi chạy shell script:', error);
    throw error;
  }
}
