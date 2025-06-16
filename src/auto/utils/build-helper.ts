import * as path from 'path';
import { execSync } from 'child_process';
import { Logger } from '@nestjs/common';

const logger = new Logger('BuildHelper');

export function buildToJs({
  targetDir,
  outDir,
}: {
  targetDir: string;
  outDir: string;
}) {
  const script = `npx node ${path.resolve('build-entities.js')} -t ${targetDir} -o ${outDir}`;
  logger.log('Chuẩn bị build file js');
  logger.log('script', script);

  try {
    execSync(script, { stdio: 'inherit' });
    logger.debug('Build file js thành công');
  } catch (err) {
    logger.error('Lỗi khi chạy shell script:', err);
  }
}
