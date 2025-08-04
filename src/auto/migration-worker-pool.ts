import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { Logger } from '@nestjs/common';

export class MigrationWorkerPool {
  private worker: ChildProcess;
  private isReady = false;
  private taskCounter = 0;
  private pendingTasks = new Map<number, { resolve: Function; reject: Function }>();
  private logger = new Logger('MigrationWorkerPool');

  async init() {
    const startTime = Date.now();
    this.logger.log('🚀 Initializing migration worker...');

    // Use compiled JS file from dist folder instead of ts-node for better performance
    const workerPath = path.resolve(__dirname, 'migration-worker.js');
    
    this.logger.debug(`Worker path: ${workerPath}`);
    this.logger.debug(`CWD: ${process.cwd()}`);
    
    this.worker = spawn('node', [workerPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env },
      cwd: process.cwd(),
    });

    // Handle worker messages
    this.worker.on('message', (message: any) => {
      if (message.type === 'ready') {
        this.isReady = true;
        this.logger.log(`✅ Migration worker ready in ${Date.now() - startTime}ms`);
        return;
      }

      // Handle task responses
      const taskId = message.taskId;
      const pendingTask = this.pendingTasks.get(taskId);
      if (pendingTask) {
        this.pendingTasks.delete(taskId);
        if (message.success) {
          pendingTask.resolve(message.result);
        } else {
          pendingTask.reject(new Error(message.error));
        }
      }
    });

    // Handle worker errors
    this.worker.on('error', (error) => {
      this.logger.error('Worker process error:', error);
    });

    this.worker.on('exit', (code, signal) => {
      this.logger.warn(`Worker process exited with code ${code}, signal ${signal}`);
      this.isReady = false;
    });

    // Handle worker stdout/stderr
    this.worker.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      this.logger.debug(`Worker stdout: ${output}`);
      // Check for ready message in stdout as fallback
      if (output.includes('[MigrationWorker] Worker process ready')) {
        this.logger.warn('Worker ready detected via stdout (IPC might not be working)');
      }
    });

    this.worker.stderr?.on('data', (data) => {
      const error = data.toString().trim();
      this.logger.warn(`Worker stderr: ${error}`);
      // Check for IPC errors
      if (error.includes('No IPC channel available')) {
        this.logger.error('Worker IPC channel not available - falling back to direct mode');
      }
    });

    // Wait for worker to be ready
    await this.waitForReady();
  }

  private async waitForReady(timeout = 10000): Promise<void> {
    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      const checkReady = () => {
        if (this.isReady) {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Migration worker timeout'));
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });
  }

  async generateMigration(params: any = {}): Promise<any> {
    if (!this.isReady) {
      throw new Error('Migration worker not ready');
    }

    const taskId = ++this.taskCounter;
    
    return new Promise((resolve, reject) => {
      this.pendingTasks.set(taskId, { resolve, reject });
      
      this.worker.send({
        type: 'generate',
        taskId,
        params
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingTasks.has(taskId)) {
          this.pendingTasks.delete(taskId);
          reject(new Error('Migration generation timeout'));
        }
      }, 30000);
    });
  }

  async runMigration(params: any = {}): Promise<any> {
    if (!this.isReady) {
      throw new Error('Migration worker not ready');
    }

    const taskId = ++this.taskCounter;
    
    return new Promise((resolve, reject) => {
      this.pendingTasks.set(taskId, { resolve, reject });
      
      this.worker.send({
        type: 'run',
        taskId,
        params
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingTasks.has(taskId)) {
          this.pendingTasks.delete(taskId);
          reject(new Error('Migration run timeout'));
        }
      }, 30000);
    });
  }

  async destroy() {
    if (this.worker && !this.worker.killed) {
      this.logger.log('🔥 Destroying migration worker...');
      this.worker.kill('SIGTERM');
      this.isReady = false;
    }
  }
}

// Singleton instance
let migrationWorkerPool: MigrationWorkerPool | null = null;

export async function getMigrationWorkerPool(): Promise<MigrationWorkerPool> {
  if (!migrationWorkerPool) {
    migrationWorkerPool = new MigrationWorkerPool();
    await migrationWorkerPool.init();
  }
  return migrationWorkerPool;
}