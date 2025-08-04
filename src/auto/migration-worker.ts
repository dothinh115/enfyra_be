import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Keep worker alive
process.on('message', async (task: any) => {
  try {
    console.log(`[MigrationWorker] Received task: ${task.type}`);
    
    switch (task.type) {
      case 'generate':
        const generateResult = await handleGenerateMigration(task.params);
        if (process.send) process.send({ success: true, result: generateResult, taskId: task.taskId });
        break;
        
      case 'run':
        const runResult = await handleRunMigration(task.params);
        if (process.send) process.send({ success: true, result: runResult, taskId: task.taskId });
        break;
        
      default:
        if (process.send) process.send({ success: false, error: `Unknown task type: ${task.type}`, taskId: task.taskId });
    }
  } catch (error) {
    console.error('[MigrationWorker] Error:', error);
    if (process.send) {
      process.send({ 
        success: false, 
        error: error.message,
        taskId: task.taskId 
      });
    }
  }
});

async function handleGenerateMigration(params: any) {
  const migrationDir = path.resolve('src', 'migrations', 'AutoMigration');
  const needDeleteDir = path.resolve('src', 'migrations');
  const appDataSourceDir = path.resolve('src', 'data-source', 'data-source.ts');

  console.log('[MigrationWorker] Preparing to generate migration file');

  // Clean up existing migrations
  if (fs.existsSync(needDeleteDir)) {
    fs.rmSync(needDeleteDir, { recursive: true, force: true });
    console.log('[MigrationWorker] Successfully deleted directory', needDeleteDir);
  }

  fs.mkdirSync(migrationDir, { recursive: true });
  console.log('[MigrationWorker] Successfully created directory', migrationDir);

  // Use ts-node to run TypeORM with TypeScript support
  const tsNode = path.resolve('node_modules/.bin/ts-node');
  const typeormCli = path.resolve('node_modules/typeorm/cli.js');
  const script = `${tsNode} ${typeormCli} migration:generate ${migrationDir} -d ${appDataSourceDir}`;
  
  try {
    const { stdout, stderr } = await execAsync(script, {
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' }
    });

    if (stdout) console.log('[MigrationWorker] stdout:', stdout);
    if (stderr && !stderr.includes('No changes in database schema were found')) {
      console.warn('[MigrationWorker] stderr:', stderr);
    }

    // Check for "No changes" case
    const errorMessage = stdout || stderr || '';
    if (errorMessage.includes('No changes in database schema were found')) {
      console.log('[MigrationWorker] ⏭️ No changes to generate migration. Skipping.');
      return { skipped: true, reason: 'No schema changes' };
    }
  } catch (error: any) {
    // Handle the "No changes" case when it comes as an error
    const errorMessage = error?.message || '';
    const stdout = error?.stdout || '';
    const stderr = error?.stderr || '';
    
    if (stdout.includes('No changes in database schema were found') || 
        stderr.includes('No changes in database schema were found') ||
        errorMessage.includes('No changes in database schema were found')) {
      console.log('[MigrationWorker] ⏭️ No changes to generate migration. Skipping.');
      return { skipped: true, reason: 'No schema changes' };
    }
    
    // If it's a real error, re-throw
    throw error;
  }

  console.log('[MigrationWorker] Migration file generation successful!');
  return { success: true };
}

async function handleRunMigration(params: any) {
  const dataSourceDir = path.resolve('src', 'data-source', 'data-source.ts');
  const tsNode = path.resolve('node_modules/.bin/ts-node');
  const typeormCli = path.resolve('node_modules/typeorm/cli.js');
  const script = `${tsNode} ${typeormCli} migration:run -d ${dataSourceDir}`;

  console.log('[MigrationWorker] Preparing to run migration');
  console.log('[MigrationWorker] Script:', script);

  const { stdout, stderr } = await execAsync(script, {
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' }
  });
  
  if (stdout) console.log('[MigrationWorker] stdout:', stdout);
  if (stderr) console.warn('[MigrationWorker] stderr:', stderr);
  
  console.log('[MigrationWorker] Migration execution successful!');
  return { success: true };
}

// Signal that worker is ready
console.log('[MigrationWorker] Worker process ready and waiting for tasks...');
if (process.send) {
  process.send({ type: 'ready' });
} else {
  console.error('[MigrationWorker] No IPC channel available');
}

// Keep process alive
process.on('disconnect', () => {
  console.log('[MigrationWorker] Parent disconnected, exiting...');
  process.exit(0);
});