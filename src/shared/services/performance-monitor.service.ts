import { Injectable, Logger } from '@nestjs/common';

export interface PerformanceMetrics {
  operation: string;
  duration: number;
  memoryUsage: number;
  timestamp: Date;
  success: boolean;
  error?: string;
}

@Injectable()
export class PerformanceMonitorService {
  private readonly logger = new Logger(PerformanceMonitorService.name);
  private metrics: PerformanceMetrics[] = [];
  private readonly maxMetrics = 1000; // Keep only last 1000 metrics

  constructor() {}

  /**
   * Monitor performance of async operations
   */
  async monitor<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      const memoryUsage = process.memoryUsage().heapUsed - startMemory;

      this.recordMetric({
        operation,
        duration,
        memoryUsage,
        timestamp: new Date(),
        success: true,
      });

      // Log slow operations
      if (duration > 1000) {
        this.logger.warn(
          `🐌 Slow operation detected: ${operation} took ${duration}ms`
        );
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const memoryUsage = process.memoryUsage().heapUsed - startMemory;

      this.recordMetric({
        operation,
        duration,
        memoryUsage,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      this.logger.error(
        `❌ Operation failed: ${operation} after ${duration}ms`,
        error
      );
      throw error;
    }
  }

  /**
   * Monitor performance of sync operations
   */
  monitorSync<T>(operation: string, fn: () => T): T {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      const result = fn();
      const duration = Date.now() - startTime;
      const memoryUsage = process.memoryUsage().heapUsed - startMemory;

      this.recordMetric({
        operation,
        duration,
        memoryUsage,
        timestamp: new Date(),
        success: true,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const memoryUsage = process.memoryUsage().heapUsed - startMemory;

      this.recordMetric({
        operation,
        duration,
        memoryUsage,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      this.logger.error(
        `❌ Sync operation failed: ${operation} after ${duration}ms`,
        error
      );
      throw error;
    }
  }

  /**
   * Get performance statistics
   */
  getStats() {
    if (this.metrics.length === 0) {
      return {
        totalOperations: 0,
        averageDuration: 0,
        averageMemoryUsage: 0,
        successRate: 0,
        slowOperations: 0,
      };
    }

    const successful = this.metrics.filter(m => m.success);
    const slow = this.metrics.filter(m => m.duration > 1000);

    return {
      totalOperations: this.metrics.length,
      averageDuration:
        this.metrics.reduce((sum, m) => sum + m.duration, 0) /
        this.metrics.length,
      averageMemoryUsage:
        this.metrics.reduce((sum, m) => sum + m.memoryUsage, 0) /
        this.metrics.length,
      successRate: (successful.length / this.metrics.length) * 100,
      slowOperations: slow.length,
      recentMetrics: this.metrics.slice(-10), // Last 10 metrics
    };
  }

  /**
   * Clear old metrics to save memory
   */
  clearOldMetrics() {
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
      this.logger.debug(
        `🧹 Cleared old metrics, keeping ${this.maxMetrics} most recent`
      );
    }
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics() {
    return {
      timestamp: new Date(),
      stats: this.getStats(),
      metrics: this.metrics,
    };
  }

  private recordMetric(metric: PerformanceMetrics) {
    this.metrics.push(metric);
    this.clearOldMetrics();

    // Log metric for monitoring
    this.logger.debug(
      `📊 Performance metric: ${metric.operation} - ${metric.duration}ms`
    );
  }
}
