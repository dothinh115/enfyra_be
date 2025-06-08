import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { BcryptService } from './bcrypt.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, BcryptService],
  exports: [BcryptService],
})
export class AuthModule {}
