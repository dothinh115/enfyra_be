import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { DataSource } from 'typeorm';

// Global setup for e2e tests
beforeAll(async () => {
  // Setup test environment
  process.env.NODE_ENV = 'test';

  console.log('🚀 Setting up e2e test environment...');
});

afterAll(async () => {
  // Cleanup test environment
  console.log('🧹 Cleaning up e2e test environment...');
});

// Global test timeout
jest.setTimeout(60000);

// Suppress console logs during tests (optional)
if (process.env.SUPPRESS_LOGS === 'true') {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
}
