# Authentication Documentation

## Overview

Enfyra Backend uses JWT (JSON Web Tokens) for authentication and implements role-based access control (RBAC) for authorization. The system supports both REST API and GraphQL authentication.

## Authentication Flow

### 1. Login Process

**REST API:**

```http
POST /auth/login
Content-Type: application/json

{
  "email": "enfyra@admin.com",
  "password": "1234"
}
```

**Response:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expTime": 1754378861000,
  "statusCode": 201,
  "message": "Success"
}
```

### 2. Using JWT Token

**REST API:**

```http
GET /posts
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## JWT Strategy

### Token Structure

```typescript
// JWT Payload
{
  "sub": "user_id",
  "email": "user@example.com",
  "role": "admin",
  "permissions": ["read", "write", "delete"],
  "iat": 1640995200,
  "exp": 1641081600
}
```

### Configuration

```typescript
// src/auth/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions,
    };
  }
}
```

## Authorization

### Role-Based Access Control

```typescript
// Define roles and permissions
enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
}

enum Permission {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  MANAGE_USERS = 'manage_users',
}
```

### Route Protection

```typescript
// Protect routes with roles
@Controller('admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('admin')
export class AdminController {
  @Get('users')
  async getUsers() {
    // Only admins can access
  }
}

// Protect with specific permissions
@Controller('posts')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Permissions('read', 'write')
export class PostController {
  @Post()
  async createPost() {
    // Users with read and write permissions can access
  }
}
```

### Custom Guards

#### JWT Auth Guard

```typescript
// src/guard/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw new AuthenticationException('Invalid or expired token');
    }
    return user;
  }
}
```

#### Role Guard

```typescript
// src/guard/role.guard.ts
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.role === role);
  }
}
```

## User Management

### User Entity

```typescript
// src/entities/user_definition.entity.ts
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  role: string;

  @Column('simple-array')
  permissions: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### User Service

```typescript
// src/auth/auth.service.ts
@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private bcryptService: BcryptService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.userService.findByEmail(email);
    if (user && (await this.bcryptService.compare(password, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      permissions: user.permissions,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' }),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
    };
  }
}
```

## Password Security

### Bcrypt Service

```typescript
// src/auth/bcrypt.service.ts
@Injectable()
export class BcryptService {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
```

### Password Validation

```typescript
// Password requirements
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

// Validation pipe
@UsePipes(new ValidationPipe({
  transform: true,
  whitelist: true,
}))
```

## Token Management

### Refresh Tokens

```typescript
// Refresh token endpoint
@Post('refresh')
async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
  try {
    const payload = this.jwtService.verify(refreshTokenDto.refreshToken);
    const user = await this.userService.findById(payload.sub);

    return this.login(user);
  } catch (error) {
    throw new AuthenticationException('Invalid refresh token');
  }
}
```

### Token Blacklisting

```typescript
// Store invalidated tokens in Redis
@Post('logout')
async logout(@Body() logoutDto: LogoutDto) {
  // Add token to blacklist
  await this.redisService.setex(
    `blacklist:${logoutDto.token}`,
    3600, // 1 hour
    'true'
  );

  return { message: 'Logged out successfully' };
}
```

## Security Best Practices

### 1. Token Security

- Use strong JWT secrets
- Set appropriate token expiration times
- Implement token refresh mechanism
- Blacklist invalidated tokens

### 2. Password Security

- Use bcrypt with high salt rounds
- Enforce strong password policies
- Implement rate limiting on login attempts
- Use HTTPS in production

### 3. Session Management

- Implement session timeout
- Track active sessions
- Allow users to revoke sessions
- Monitor for suspicious activity

### 4. Rate Limiting

```typescript
// Rate limiting for auth endpoints
@UseGuards(ThrottlerGuard)
@Throttle(5, 60) // 5 attempts per minute
@Post('login')
async login(@Body() loginDto: LoginDto) {
  // Login logic
}
```

## Error Handling

### Authentication Errors

```typescript
// Custom exceptions
export class AuthenticationException extends CustomException {
  readonly errorCode = 'UNAUTHORIZED';
  readonly statusCode = 401;
}

export class AuthorizationException extends CustomException {
  readonly errorCode = 'FORBIDDEN';
  readonly statusCode = 403;
}
```

### Error Responses

```json
{
  "success": false,
  "message": "Authentication required",
  "statusCode": 401,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token",
    "timestamp": "2025-08-05T03:54:42.610Z",
    "path": "/api/protected",
    "method": "GET"
  }
}
```

## Testing Authentication

### Unit Tests

```typescript
describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should validate user credentials', async () => {
    const result = await service.validateUser('test@example.com', 'password');
    expect(result).toBeDefined();
  });
});
```

### Integration Tests

```typescript
describe('Authentication', () => {
  it('should login with valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'enfyra@admin.com',
        password: '1234',
      })
      .expect(200);

    expect(response.body.accessToken).toBeDefined();
  });

  it('should reject invalid credentials', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'enfyra@admin.com',
        password: 'wrongpassword',
      })
      .expect(401);
  });
});
```

## Environment Variables

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Security
BCRYPT_ROUNDS=12
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCKOUT_DURATION=300
```

## Monitoring and Logging

### Authentication Logs

```typescript
// Log authentication events
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  async login(user: any) {
    this.logger.log(`User ${user.email} logged in successfully`);
    // Login logic
  }

  async loginFailed(email: string, reason: string) {
    this.logger.warn(`Failed login attempt for ${email}: ${reason}`);
  }
}
```

### Security Monitoring

- Track failed login attempts
- Monitor token usage patterns
- Alert on suspicious activity
- Log authentication events
