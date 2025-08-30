# Testing Guide - ENFYRA_BE

## 🚀 **Available Test Scripts**

### **Basic Tests**

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage
yarn test:cov

# Debug tests
yarn test:debug
```

### **Specific Test Types**

```bash
# Unit tests only
yarn test:unit

# Integration tests only
yarn test:integration

# E2E tests only
yarn test:e2e

# Stress tests only
yarn test:stress

# Builder tests only
yarn test:builders

# Performance tests only
yarn test:performance
```

### **Advanced Test Options**

```bash
# Run all tests (including empty test files)
yarn test:all

# CI/CD mode (no watch, with coverage)
yarn test:ci

# Coverage with multiple reporters
yarn test:coverage

# Coverage in watch mode
yarn test:coverage:watch

# Debug E2E tests
yarn test:debug:e2e

# Parallel execution (4 workers)
yarn test:parallel

# Verbose output
yarn test:verbose

# Update snapshots
yarn test:update

# Clear Jest cache
yarn test:clear
```

## 📁 **Test Structure**

```
test/
├── unit/                    # Unit tests
│   ├── auth/              # Authentication tests
│   ├── common/            # Common utilities tests
│   ├── dynamic-api/       # Dynamic API service tests
│   ├── query-engine/      # Query engine tests
│   └── ...
├── integration/            # Integration tests
│   ├── route-detect-integration.spec.ts
│   ├── script-context-exceptions.integration.spec.ts
│   └── ...
├── e2e/                   # End-to-end tests
│   ├── app.e2e-spec.ts
│   ├── basic.e2e-spec.ts
│   ├── dynamic-api.e2e-spec.ts
│   ├── graphql.e2e-spec.ts
│   └── ...
├── stress/                # Stress/load tests
├── builders/              # Test builder utilities
├── setup/                 # Test setup files
│   ├── e2e.setup.ts
│   └── integration.setup.ts
├── jest-e2e.json         # E2E Jest configuration
└── README.md             # This file
```

## 🎯 **Test Categories**

### **Unit Tests** (`test:unit`)

- Test individual functions and methods
- Mock external dependencies
- Fast execution
- High isolation

### **Integration Tests** (`test:integration`)

- Test component interactions
- Test database operations
- Test API endpoints
- Medium execution time

### **E2E Tests** (`test:e2e`)

- Test complete user workflows
- Test full application stack
- Test real database
- Slowest execution

### **Stress Tests** (`test:stress`)

- Test performance under load
- Test memory usage
- Test concurrent operations
- Long execution time

## ⚙️ **Configuration Files**

### **Main Jest Config** (`package.json`)

```json
{
  "jest": {
    "testMatch": ["<rootDir>/test/**/*.spec.ts"],
    "collectCoverageFrom": ["src/**/*.(t|j)s"],
    "coverageDirectory": "coverage"
  }
}
```

### **E2E Jest Config** (`test/jest-e2e.json`)

```json
{
  "testRegex": ".e2e-spec.ts$",
  "testTimeout": 60000,
  "maxWorkers": 1,
  "forceExit": true
}
```

## 🔧 **Test Setup**

### **E2E Setup** (`test/setup/e2e.setup.ts`)

- Sets test environment variables
- Configures global timeouts
- Handles cleanup

### **Integration Setup** (`test/setup/integration.setup.ts`)

- Database setup
- Test data seeding
- Environment configuration

## 📊 **Coverage Reports**

### **Generate Coverage**

```bash
yarn test:coverage
```

### **Coverage Outputs**

- **Text**: Console output
- **LCOV**: CI/CD integration
- **HTML**: Browser view (`coverage/index.html`)

### **Coverage Targets**

- **Overall**: >80%
- **Critical Paths**: >90%
- **New Code**: >95%

## 🚨 **Common Issues & Solutions**

### **Test Timeout**

```bash
# Increase timeout for specific tests
jest.setTimeout(30000);

# Or use --testTimeout flag
yarn test --testTimeout=30000
```

### **Database Connection Issues**

```bash
# Ensure database services are running
# Check if MySQL and Redis are accessible on default ports

# Check environment variables
echo $NODE_ENV
echo $DB_HOST
echo $DB_PORT
```

### **Memory Issues**

```bash
# Clear Jest cache
yarn test:clear

# Run with limited workers
yarn test:parallel --maxWorkers=2
```

## 🎭 **Writing Tests**

### **Test File Naming**

- Unit tests: `*.spec.ts`
- Integration tests: `*.integration.spec.ts`
- E2E tests: `*.e2e-spec.ts`

### **Test Structure**

```typescript
describe('Feature Name', () => {
  let service: TestService;

  beforeEach(async () => {
    // Setup
  });

  afterEach(async () => {
    // Cleanup
  });

  it('should do something', async () => {
    // Test logic
    expect(result).toBe(expected);
  });
});
```

### **Async Testing**

```typescript
it('should handle async operation', async () => {
  const result = await service.asyncMethod();
  expect(result).toBeDefined();
});
```

## 🔄 **CI/CD Integration**

### **GitHub Actions Example**

```yaml
- name: Run Tests
  run: |
    yarn test:ci
    yarn test:e2e

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info
```

### **Local CI Mode**

```bash
# Simulate CI environment
yarn test:ci
```

## 📈 **Performance Testing**

### **Run Performance Tests**

```bash
yarn test:performance
```

### **Performance Metrics**

- Response time < 200ms
- Database queries < 100ms
- Memory usage < 512MB
- CPU usage < 80%

## 🧹 **Cleanup**

### **Remove Test Data**

```bash
# Clear test database
yarn test:clear

# Remove coverage reports
rm -rf coverage/
```

### **Reset Test Environment**

```bash
# Stop test services (if using Docker)
# Note: Manage Docker services separately

# Clear caches
yarn test:clear
```

---

**Happy Testing! 🎉**
