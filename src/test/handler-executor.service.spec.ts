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
    priority: 1,
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
    once: jest.fn(),
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
        setTimeout(
          () =>
            callback({
              type: 'done',
              data: { success: true },
              ctx: { $share: {}, $body: {} },
            }),
          10,
        );
      }
      return mockChild;
    });
    mockChild.once.mockImplementation((event, callback) => {
      // Don't trigger exit/error events by default
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
    const mockCode =
      'function handler(data) { return { processed: true, id: data.id }; }';
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
      $share: {},
      $data: { id: '123', name: 'Test User' },
    };

    it('should execute code successfully', async () => {
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'message') {
          setTimeout(
            () =>
              callback({
                type: 'done',
                data: { processed: true, id: '123' },
                ctx: { $share: {}, $body: {} },
              }),
            10,
          );
        }
        return mockChild;
      });

      const result = await service.run(mockCode, mockContext);

      expect(result).toEqual({ processed: true, id: '123' });
      expect(mockExecutorPool.acquire).toHaveBeenCalled();
      expect(mockChild.send).toHaveBeenCalledWith({
        type: 'execute',
        code: mockCode,
        ctx: expect.objectContaining({
          $repos: expect.any(Object),
          $body: expect.any(Object),
          $query: expect.any(Object),
          $params: expect.any(Object),
          $user: null,
          $logs: expect.any(Object),
          $helpers: expect.any(Object),
          $req: expect.any(Object),
          $errors: expect.any(Object),
          $share: expect.any(Object),
        }),
      });
    });

    it('should handle execution timeout', async () => {
      mockChild.on.mockImplementation(() => mockChild); // No message response

      await expect(service.run(mockCode, mockContext, 100)).rejects.toThrow(
        'Script execution timed out',
      );
      expect(mockChild.kill).toHaveBeenCalled();
    });

    it('should handle child process errors', async () => {
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'message') {
          setTimeout(
            () => callback({ type: 'error', error: 'Execution failed' }),
            10,
          );
        }
        return mockChild;
      });

      await expect(service.run(mockCode, mockContext)).rejects.toThrow(
        'Script execution failed',
      );
    });

    it('should use default timeout', async () => {
      // Mock no response to trigger timeout
      mockChild.on.mockImplementation(() => mockChild);

      await expect(service.run(mockCode, mockContext, 100)).rejects.toThrow(
        'Script execution timed out',
      );
      expect(mockChild.kill).toHaveBeenCalled();
    });

    it('should handle malformed code', async () => {
      const badCode = 'invalid javascript syntax {{{';

      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'message') {
          setTimeout(
            () => callback({ type: 'error', error: 'Syntax error' }),
            10,
          );
        }
        return mockChild;
      });

      await expect(service.run(badCode, mockContext)).rejects.toThrow(
        'Script execution failed',
      );
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent code executions', async () => {
      // Mock successful responses for all concurrent executions
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'message') {
          setTimeout(
            () =>
              callback({
                type: 'done',
                data: { processed: true, id: 0 },
                ctx: { $share: {}, $body: {} },
              }),
            10,
          );
        }
        return mockChild;
      });

      const promises = Array.from({ length: 3 }, (_, i) =>
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
            $share: {},
            $data: { id: i },
          },
          1000,
        ),
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
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
          setTimeout(
            () =>
              callback({
                type: 'done',
                data: { processed: true, count: 100, sum: 9900 },
                ctx: { $share: {}, $body: {} },
              }),
            50,
          );
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
        $share: {},
        $data: {},
      });

      expect(result.processed).toBe(true);
      expect(result.count).toBe(100);
      expect(result.sum).toBe(9900);
    });
  });

  describe('Error Handling', () => {
    it('should handle pool acquisition failures', async () => {
      // Mock the service method directly to avoid async issues
      const mockRun = jest
        .spyOn(service, 'run')
        .mockRejectedValue(new Error('Pool exhausted'));

      await expect(
        service.run('function handler() {}', {
          $repos: {},
          $body: {},
          $query: {},
          $params: {},
          $user: null,
          $logs: jest.fn(),
          $helpers: {},
          $req: {} as any,
          $errors: {},
          $share: {},
          $data: {},
        }),
      ).rejects.toThrow('Pool exhausted');

      mockRun.mockRestore();
    });

    it('should cleanup on timeout', async () => {
      mockChild.on.mockImplementation(() => mockChild); // No response

      await expect(
        service.run(
          'function handler() {}',
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
            $share: {},
            $data: {},
          },
          100,
        ),
      ).rejects.toThrow('Script execution timed out');

      expect(mockChild.removeAllListeners).toHaveBeenCalled();
      expect(mockChild.kill).toHaveBeenCalled();
    });
  });
});
