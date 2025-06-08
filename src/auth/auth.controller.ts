import { Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginAuthDto } from './dto/login-auth.dto';
import { LogoutAuthDto } from './dto/logout-auth.dto';
import { Request } from 'express';
import { User_definition } from '../entities/user_definition.entity';
import { RefreshTokenAuthDto } from './dto/refresh-token-auth.dto';

@Controller()
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('auth/login')
  login(body: LoginAuthDto) {
    return this.authService.login(body);
  }

  @Post('auth/logout')
  logout(body: LogoutAuthDto, req: Request & { user: User_definition }) {
    return this.authService.logout(body, req);
  }

  @Post('auth/refresh-token')
  refreshToken(body: RefreshTokenAuthDto) {
    return this.authService.refreshToken(body);
  }
}
