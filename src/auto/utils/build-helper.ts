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
  const script = `npx node ${path.resolve('scripts/build-entities.js')} -t ${targetDir} -o ${outDir}`;
  logger.log('Preparing to build JavaScript files');
  logger.log('script', script);

  try {
    execSync(script, { stdio: 'inherit' });
    logger.debug('JavaScript file build successful');
  } catch (err) {
    logger.error('Error running shell script:', err);
  }
}
