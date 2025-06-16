import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { Logger } from '@nestjs/common';

const logger = new Logger('MigrationHelper');

export function generateMigrationFile() {
  const migrationDir = path.resolve('src', 'migrations', 'AutoMigration');
  const appDataSourceDir = path.resolve('src', 'data-source', 'data-source.ts');
  const needDeleteDir = path.resolve('src', 'migrations');

  logger.log('Chuẩn bị generate file migration');

  try {
    if (fs.existsSync(needDeleteDir)) {
      const files = fs.readdirSync(needDeleteDir);
      for (const file of files) {
        fs.unlinkSync(path.join(needDeleteDir, file));
      }
      logger.log(`Đã xoá sạch thư mục ${needDeleteDir}`);
    } else {
      fs.mkdirSync(migrationDir, { recursive: true });
      logger.log(`Đã tạo thư mục ${migrationDir}`);
    }

    const script = `npm run typeorm -- migration:generate ${migrationDir} -d ${appDataSourceDir}`;
    execSync(script, { stdio: 'inherit' });
    logger.debug('Generate file migration thành công!');
  } catch (error) {
    logger.error('Lỗi khi chạy generate migration:', error);
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
  }
}
