import { spawn } from 'child_process';
import chalk from 'chalk';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const DB_NAME = 'dynamiq';
const MAX_LOOP = 100;
const WAIT_BETWEEN = 2000;

function log(msg: string) {
  console.log(chalk.cyan(`[TEST] ${msg}`));
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function createTempDataSource(): DataSource {
  return new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  });
}

async function createDatabase() {
  const tmpDataSource = createTempDataSource();
  await tmpDataSource.initialize();
  await tmpDataSource.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);

  // Đảm bảo DB đã được tạo
  let retries = 5;
  while (retries--) {
    const res = await tmpDataSource.query(`SHOW DATABASES LIKE '${DB_NAME}'`);
    if (res.length > 0) break;
    log(`⏳ Waiting for DB '${DB_NAME}' to appear...`);
    await sleep(500);
  }

  await tmpDataSource.destroy();
  log(`✅ Created DB ${DB_NAME}`);
}

async function dropDatabase() {
  const tmpDataSource = createTempDataSource();
  await tmpDataSource.initialize();
  await tmpDataSource.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
  await tmpDataSource.destroy();
  log(`🗑️ Dropped DB ${DB_NAME}`);
}

async function runAttempt(i: number) {
  log(`\n🔁 Attempt ${i + 1} / ${MAX_LOOP}`);

  await createDatabase();
  await sleep(1000); // đảm bảo DB đã sẵn sàng

  return new Promise((resolve, reject) => {
    const proc = spawn('yarn', ['start'], {
      env: {
        ...process.env,
        DB_NAME,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let started = false;

    proc.stdout.on('data', (data) => {
      const line = data.toString();
      process.stdout.write(line);
      if (line.includes('Listening at') || line.includes('started')) {
        started = true;
        log(`✅ App started successfully on attempt ${i + 1}`);
        proc.kill('SIGINT');
      }
    });

    proc.on('exit', async (code) => {
      await dropDatabase();

      if (!started) {
        log(chalk.red(`❌ Failed on attempt ${i + 1}, exit code ${code}`));
        reject(new Error('App did not start'));
      } else {
        log(`🧹 Cleaned up attempt ${i + 1}`);
        resolve(true);
      }
    });
  });
}

(async () => {
  for (let i = 0; i < MAX_LOOP; i++) {
    try {
      await runAttempt(i);
      await sleep(WAIT_BETWEEN);
    } catch (e: any) {
      log(chalk.red(`💥 Stopping loop due to failure: ${e.message}`));
      process.exit(1);
    }
  }

  log(chalk.green('🎉 All attempts finished successfully'));
})();
