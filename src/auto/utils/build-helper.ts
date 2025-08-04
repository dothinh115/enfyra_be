import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '@nestjs/common';

const execAsync = promisify(exec);
const logger = new Logger('BuildHelper');

export async function buildToJs({
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
    const { stdout, stderr } = await execAsync(script);
    if (stdout) logger.debug(stdout);
    if (stderr) logger.warn(stderr);
    logger.debug('JavaScript file build successful');
  } catch (err) {
    logger.error('Error running shell script:', err);
    throw err;
  }
}
