# Exception Handling Guide

## Tổng quan

Enfyra Backend sử dụng một hệ thống exception handling thống nhất và có cấu trúc để xử lý lỗi một cách nhất quán và có thể theo dõi được. Hệ thống này bao gồm custom exceptions, global exception filter và logging service.

## Cấu trúc Exception

### 1. Base Custom Exception

```typescript
import { CustomException } from '../exceptions/custom-exceptions';

// Abstract base class cho tất cả custom exceptions
export abstract class CustomException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus,
    public readonly errorCode: string,
    public readonly details?: any,
  ) {}
}
```

### 2. Error Response Format

Tất cả errors trả về client đều có format thống nhất:

```typescript
interface ErrorResponse {
  success: false;
  message: string;
  statusCode: number;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    path: string;
    method: string;
    correlationId?: string;
  };
}
```

## Các Loại Exception

### Business Logic Exceptions

```typescript
import { BusinessLogicException, ValidationException, ResourceNotFoundException, DuplicateResourceException } from '../exceptions/custom-exceptions';

// Lỗi business logic
throw new BusinessLogicException('Invalid operation: Cannot delete active user');

// Lỗi validation
throw new ValidationException('Email format is invalid', { field: 'email' });

// Resource không tồn tại
throw new ResourceNotFoundException('User', '123');

// Resource bị duplicate
throw new DuplicateResourceException('User', 'email', 'user@example.com');
```

### Authentication & Authorization Exceptions

```typescript
import { 
  AuthenticationException, 
  AuthorizationException, 
  TokenExpiredException, 
  InvalidTokenException 
} from '../exceptions/custom-exceptions';

// Authentication thất bại
throw new AuthenticationException('Invalid credentials');

// Không đủ quyền
throw new AuthorizationException('You need admin role to perform this action');

// Token hết hạn
throw new TokenExpiredException();

// Token không hợp lệ
throw new InvalidTokenException();
```

### Database Exceptions

```typescript
import { 
  DatabaseException, 
  DatabaseConnectionException, 
  DatabaseQueryException 
} from '../exceptions/custom-exceptions';

// Lỗi database chung
throw new DatabaseException('Transaction failed', { operation: 'create_user' });

// Lỗi kết nối database
throw new DatabaseConnectionException();

// Lỗi query
throw new DatabaseQueryException('Invalid SQL syntax', { query: 'SELECT...' });
```

### External Service Exceptions

```typescript
import { ExternalServiceException, ServiceUnavailableException } from '../exceptions/custom-exceptions';

// Lỗi external service
throw new ExternalServiceException('PaymentGateway', 'Payment processing failed');

// Service unavailable
throw new ServiceUnavailableException('EmailService');
```

### Script Execution Exceptions

```typescript
import { 
  ScriptExecutionException, 
  ScriptTimeoutException, 
  ScriptSyntaxException 
} from '../exceptions/custom-exceptions';

// Script execution thất bại
throw new ScriptExecutionException('Runtime error: variable undefined', 'script_123');

// Script timeout
throw new ScriptTimeoutException(5000, 'script_123');

// Script syntax error
throw new ScriptSyntaxException('Unexpected token', 15, 10);
```

### File & Upload Exceptions

```typescript
import { 
  FileUploadException, 
  FileNotFoundException, 
  FileSizeExceededException 
} from '../exceptions/custom-exceptions';

// File upload thất bại
throw new FileUploadException('Invalid file type', { allowedTypes: ['.jpg', '.png'] });

// File không tồn tại
throw new FileNotFoundException('/uploads/image.jpg');

// File quá lớn
throw new FileSizeExceededException('10MB', '15MB');
```

### Rate Limiting & Other Exceptions

```typescript
import { 
  RateLimitExceededException, 
  SchemaException, 
  ConfigurationException 
} from '../exceptions/custom-exceptions';

// Rate limit exceeded
throw new RateLimitExceededException(100, '1 hour');

// Schema error
throw new SchemaException('Invalid table definition', { tableName: 'users' });

// Configuration error
throw new ConfigurationException('Missing API key', 'PAYMENT_API_KEY');
```

## GraphQL Error Handling

Cho GraphQL endpoints, sử dụng `throwGqlError`:

```typescript
import { throwGqlError } from '../graphql/utils/throw-error';

// Throw GraphQL error
throwGqlError('400', 'Invalid input data', { field: 'email' });
throwGqlError('401', 'Unauthorized');
throwGqlError('404', 'Resource not found');
```

## Best Practices

### 1. Sử dụng Exception phù hợp

```typescript
// ✅ Tốt - Sử dụng exception cụ thể
throw new ResourceNotFoundException('User', userId);

// ❌ Không tốt - Sử dụng exception chung
throw new Error('User not found');
```

### 2. Cung cấp details hữu ích

```typescript
// ✅ Tốt - Cung cấp context
throw new ValidationException('Validation failed', {
  errors: [
    { field: 'email', message: 'Invalid email format' },
    { field: 'age', message: 'Must be greater than 0' }
  ]
});

// ❌ Không tốt - Thiếu details
throw new ValidationException('Validation failed');
```

### 3. Xử lý async operations

```typescript
async function createUser(userData: CreateUserDto) {
  try {
    const user = await userRepository.save(userData);
    return user;
  } catch (error) {
    if (error.code === 'DUPLICATE_ENTRY') {
      throw new DuplicateResourceException('User', 'email', userData.email);
    }
    throw new DatabaseException('Failed to create user', { error: error.message });
  }
}
```

### 4. Service layer exception handling

```typescript
@Injectable()
export class UserService {
  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    
    if (!user) {
      throw new ResourceNotFoundException('User', id);
    }
    
    return user;
  }

  async updateUser(id: string, updateData: UpdateUserDto): Promise<User> {
    // Kiểm tra user tồn tại
    const user = await this.findById(id); // Sẽ throw ResourceNotFoundException nếu không tìm thấy
    
    // Validate business rules
    if (updateData.role === 'admin' && !this.hasAdminPermission()) {
      throw new AuthorizationException('Only admins can assign admin role');
    }

    try {
      return await this.userRepository.save({ ...user, ...updateData });
    } catch (error) {
      throw new DatabaseException('Failed to update user', { userId: id, error: error.message });
    }
  }
}
```

### 5. Controller error handling

```typescript
@Controller('users')
export class UserController {
  @Get(':id')
  async findOne(@Param('id') id: string) {
    // Exception sẽ được GlobalExceptionFilter xử lý tự động
    return await this.userService.findById(id);
  }

  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    try {
      return await this.userService.createUser(createUserDto);
    } catch (error) {
      // Log thêm context nếu cần
      this.logger.error('Failed to create user', { dto: createUserDto, error });
      throw error; // Re-throw để GlobalExceptionFilter xử lý
    }
  }
}
```

## Logging và Monitoring

### 1. Automatic Logging

Global exception filter tự động log tất cả exceptions với:
- Correlation ID
- Request details (method, URL, user agent, IP)
- User ID (nếu có)
- Stack trace (trong development)

### 2. Manual Logging

```typescript
import { LoggingService } from '../error-handling/services/logging.service';

@Injectable()
export class SomeService {
  constructor(private loggingService: LoggingService) {}

  async someOperation() {
    try {
      // ... business logic
      this.loggingService.logBusinessEvent('user_created', userId, 'User', userId);
    } catch (error) {
      this.loggingService.error('Operation failed', { operation: 'someOperation', error });
      throw error;
    }
  }
}
```

## Testing Exception Handling

```typescript
describe('UserService', () => {
  it('should throw ResourceNotFoundException when user not found', async () => {
    jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
    
    await expect(userService.findById('nonexistent-id'))
      .rejects
      .toThrow(ResourceNotFoundException);
  });

  it('should throw ValidationException for invalid data', async () => {
    const invalidData = { email: 'invalid-email' };
    
    await expect(userService.createUser(invalidData))
      .rejects
      .toThrow(ValidationException);
  });
});
```

## Utility Functions

```typescript
import { isCustomException, getErrorCode } from '../exceptions/custom-exceptions';

// Kiểm tra xem có phải custom exception không
if (isCustomException(error)) {
  console.log('Error code:', error.errorCode);
  console.log('Details:', error.details);
}

// Lấy error code từ bất kỳ exception nào
const errorCode = getErrorCode(error);
```

## Migration từ Standard Exceptions

```typescript
// ❌ Trước đây
throw new BadRequestException('Invalid input');
throw new NotFoundException('User not found');

// ✅ Bây giờ
throw new ValidationException('Invalid input', { field: 'email' });
throw new ResourceNotFoundException('User', userId);
```

## Exception Handling trong Script Context

Khi viết dynamic scripts (handler logic, hooks, etc.), bạn có thể sử dụng exceptions thông qua object `$errors`:

### Available Error Methods

```javascript
// Business Logic Errors
$errors.businessLogic('Invalid operation: Cannot delete active user');
$errors.validation('Email format is invalid', { field: 'email' });
$errors.notFound('User', '123');
$errors.duplicate('User', 'email', 'user@example.com');

// Authentication & Authorization
$errors.unauthorized('Invalid credentials');
$errors.forbidden('Admin role required');
$errors.tokenExpired();
$errors.invalidToken();

// Database Errors
$errors.database('Transaction failed', { operation: 'create_user' });
$errors.dbQuery('Invalid SQL syntax', { query: 'SELECT...' });

// External Service Errors
$errors.externalService('PaymentGateway', 'Payment processing failed');
$errors.serviceUnavailable('EmailService');

// Rate Limiting
$errors.rateLimit(100, '1 hour');

// Script Errors
$errors.scriptError('Runtime error: variable undefined', 'script_123');
$errors.scriptTimeout(5000, 'script_123');

// Schema & Configuration
$errors.schema('Invalid table definition', { tableName: 'users' });
$errors.config('Missing API key', 'PAYMENT_API_KEY');

// File Errors
$errors.fileUpload('Invalid file type', { allowedTypes: ['.jpg', '.png'] });
$errors.fileNotFound('/uploads/image.jpg');
$errors.fileSizeExceeded('10MB', '15MB');
```

### Legacy Methods (for backward compatibility)

```javascript
// HTTP status code based errors
$errors.throw400('Bad request');
$errors.throw401('Unauthorized');
$errors.throw403('Forbidden');
$errors.throw404('User', '123');
$errors.throw409('User', 'email', 'test@email.com');
$errors.throw422('Invalid data', { field: 'age' });
$errors.throw429(100, '1 hour');
$errors.throw500('Server error');
$errors.throw503('PaymentService');
```

### Example: Handler Script

```javascript
// In route handler logic
async function handler($ctx) {
  const { $body, $user, $repos, $errors } = $ctx;

  // Validate input
  if (!$body.email || !$body.email.includes('@')) {
    $errors.validation('Invalid email format', { 
      field: 'email', 
      value: $body.email 
    });
  }

  // Check authentication
  if (!$user) {
    $errors.unauthorized('Please login to continue');
  }

  // Check authorization
  if ($user.role !== 'admin') {
    $errors.forbidden('Only admins can perform this action');
  }

  // Check if resource exists
  const existingUser = await $repos.main.findOne({ 
    where: { email: $body.email } 
  });
  
  if (existingUser) {
    $errors.duplicate('User', 'email', $body.email);
  }

  // Perform operation
  try {
    const result = await $repos.main.create($body);
    return result;
  } catch (error) {
    $errors.database('Failed to create user', { 
      error: error.message 
    });
  }
}
```

### Example: Hook Script

```javascript
// In before hook
async function beforeHook($ctx) {
  const { $body, $errors, $helpers } = $ctx;

  // Rate limiting check
  const requestCount = await getRequestCount($ctx.$user.id);
  if (requestCount > 100) {
    $errors.rateLimit(100, '1 hour');
  }

  // External service check
  const isServiceAvailable = await checkPaymentGateway();
  if (!isServiceAvailable) {
    $errors.serviceUnavailable('PaymentGateway');
  }

  // Validate business rules
  if ($body.amount > 10000) {
    $errors.businessLogic('Transaction amount exceeds limit', {
      amount: $body.amount,
      maxAmount: 10000
    });
  }
}
```

### Example: Complex Validation

```javascript
async function validateOrder($ctx) {
  const { $body, $repos, $errors } = $ctx;
  const errors = [];

  // Check product availability
  for (const item of $body.items) {
    const product = await $repos.products.findOne({ 
      where: { id: item.productId } 
    });
    
    if (!product) {
      $errors.notFound('Product', item.productId);
    }
    
    if (product.stock < item.quantity) {
      errors.push({
        productId: item.productId,
        message: 'Insufficient stock',
        available: product.stock,
        requested: item.quantity
      });
    }
  }

  if (errors.length > 0) {
    $errors.validation('Order validation failed', { errors });
  }

  // Check user credit limit
  const user = await $repos.users.findOne({ 
    where: { id: $ctx.$user.id } 
  });
  
  const totalAmount = $body.items.reduce((sum, item) => 
    sum + (item.price * item.quantity), 0
  );
  
  if (totalAmount > user.creditLimit) {
    $errors.businessLogic('Order exceeds credit limit', {
      orderAmount: totalAmount,
      creditLimit: user.creditLimit
    });
  }
}
```

### Best Practices for Script Exceptions

1. **Use specific error types** - Choose the most appropriate error method
2. **Provide context** - Always include relevant details in error messages
3. **Early validation** - Check preconditions at the beginning of scripts
4. **Consistent error handling** - Use the same patterns across all scripts
5. **Don't catch unless necessary** - Let exceptions bubble up to be handled by the framework

## Kết luận

Việc sử dụng hệ thống exception handling này giúp:
- Có error handling nhất quán trong toàn bộ ứng dụng
- Dễ dàng debug và monitor
- Cung cấp thông tin lỗi chi tiết cho client
- Tự động logging với correlation ID
- Type safety và IntelliSense support
- Consistent error handling trong cả application code và dynamic scripts

Luôn sử dụng custom exceptions thay vì generic Error hoặc HttpException để có trải nghiệm tốt nhất.