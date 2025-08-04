import { Test, TestingModule } from '@nestjs/testing';
import { HandlerExecutorService } from '../handler-executor/handler-executor.service';
import { ExecutorPoolService } from '../handler-executor/executor-pool.service';

describe('HandlerExecutorService', () => {
  let service: HandlerExecutorService;
  let executorPoolService: jest.Mocked<ExecutorPoolService>;

  const mockHandler = {
    id: '1',
    name: 'test_handler',
    tableName: 'users',
    event: 'create',
    code: `
      function handler(data) {
        return { processed: true, id: data.id };
      }
    `,
    isEnabled: true,
    priority: 1
  };

  const mockExecutorPool = {
    acquire: jest.fn(),
    release: jest.fn(),
    isHealthy: jest.fn(),
    getStats: jest.fn(),
    shutdown: jest.fn(),
  };

  const mockChild = {
    on: jest.fn(),
    send: jest.fn(),
    kill: jest.fn(),
    removeAllListeners: jest.fn(),
  };

  beforeEach(async () => {
    const mockExecutorPoolService = {
      getPool: jest.fn().mockReturnValue(mockExecutorPool),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HandlerExecutorService,
        { provide: ExecutorPoolService, useValue: mockExecutorPoolService },
      ],
    }).compile();

    service = module.get<HandlerExecutorService>(HandlerExecutorService);
    executorPoolService = module.get(ExecutorPoolService);

    // Setup default mock behaviors
    mockExecutorPool.acquire.mockResolvedValue(mockChild);
    mockChild.on.mockImplementation((event, callback) => {
      if (event === 'message') {
        // Simulate successful execution
        setTimeout(() => callback({ type: 'result', data: { success: true } }), 10);
      }
      return mockChild;
    });

    // Suppress console logs during tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('run', () => {
    const mockCode = 'function handler(data) { return { processed: true, id: data.id }; }';
    const mockContext = {
      $repos: {},
      $body: {},
      $query: {},
      $params: {},
      $user: null,
      $logs: jest.fn(),
      $helpers: {},
      $req: {} as any,
      $errors: {},
      $data: { id: '123', name: 'Test User' }
    };

    it('should execute code successfully', async () => {
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'message') {
          setTimeout(() => callback({ type: 'result', data: { processed: true, id: '123' } }), 10);
        }
        return mockChild;
      });

      const result = await service.run(mockCode, mockContext);

      expect(result).toEqual({ processed: true, id: '123' });
      expect(mockExecutorPool.acquire).toHaveBeenCalled();
      expect(mockChild.send).toHaveBeenCalledWith({
        type: 'execute',
        code: mockCode,
        ctx: mockContext
      });
    });

    it('should handle execution timeout', async () => {
      mockChild.on.mockImplementation(() => mockChild); // No message response

      await expect(service.run(mockCode, mockContext, 100)).rejects.toThrow('Timeout');
      expect(mockChild.kill).toHaveBeenCalled();
    });

    it('should handle child process errors', async () => {
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'message') {
          setTimeout(() => callback({ type: 'error', error: 'Execution failed' }), 10);
        }
        return mockChild;
      });

      await expect(service.run(mockCode, mockContext)).rejects.toThrow('Execution failed');
    });

    it('should use default timeout', async () => {
      const startTime = Date.now();
      
      // Mock no response to trigger timeout
      mockChild.on.mockImplementation(() => mockChild);

      try {
        await service.run(mockCode, mockContext); // No timeout specified, should use default 5000ms
      } catch (error) {
        const duration = Date.now() - startTime;
        expect(duration).toBeGreaterThan(4900); // Should be close to 5000ms
        expect(error.message).toBe('Timeout');
      }
    }, 10000);

    it('should handle malformed code', async () => {
      const badCode = 'invalid javascript syntax {{{';
      
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'message') {
          setTimeout(() => callback({ type: 'error', error: 'Syntax error' }), 10);
        }
        return mockChild;
      });

      await expect(service.run(badCode, mockContext)).rejects.toThrow('Syntax error');
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent code executions', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        service.run(
          `function handler(data) { return { processed: true, id: ${i} }; }`,
          {
            $repos: {},
            $body: {},
            $query: {},
            $params: {},
            $user: null,
            $logs: jest.fn(),
            $helpers: {},
            $req: {} as any,
            $errors: {},
            $data: { id: i }
          },
          1000
        )
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result.id).toBe(index);
        expect(result.processed).toBe(true);
      });
    });

    it('should handle complex code execution', async () => {
      const complexCode = `
        function handler(data) {
          const result = [];
          for (let i = 0; i < 100; i++) {
            result.push(i * 2);
          }
          return { 
            processed: true, 
            count: result.length,
            sum: result.reduce((a, b) => a + b, 0)
          };
        }
      `;

      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'message') {
          setTimeout(() => callback({ 
            type: 'result', 
            data: { processed: true, count: 100, sum: 9900 }
          }), 50);
        }
        return mockChild;
      });

      const result = await service.run(complexCode, {
        $repos: {},
        $body: {},
        $query: {},
        $params: {},
        $user: null,
        $logs: jest.fn(),
        $helpers: {},
        $req: {} as any,
        $errors: {},
        $data: {}
      });

      expect(result.processed).toBe(true);
      expect(result.count).toBe(100);
      expect(result.sum).toBe(9900);
    });
  });

  describe('Error Handling', () => {
    it('should handle pool acquisition failures', async () => {
      mockExecutorPool.acquire.mockRejectedValue(new Error('Pool exhausted'));

      await expect(service.run('function handler() {}', {
        $repos: {},
        $body: {},
        $query: {},
        $params: {},
        $user: null,
        $logs: jest.fn(),
        $helpers: {},
        $req: {} as any,
        $errors: {},
        $data: {}
      })).rejects.toThrow('Pool exhausted');
    });

    it('should cleanup on timeout', async () => {
      mockChild.on.mockImplementation(() => mockChild); // No response

      try {
        await service.run('function handler() {}', {
          $repos: {},
          $body: {},
          $query: {},
          $params: {},
          $user: null,
          $logs: jest.fn(),
          $helpers: {},
          $req: {} as any,
          $errors: {},
          $data: {}
        }, 100);
      } catch (error) {
        expect(mockChild.removeAllListeners).toHaveBeenCalled();
        expect(mockChild.kill).toHaveBeenCalled();
      }
    });
  });
});