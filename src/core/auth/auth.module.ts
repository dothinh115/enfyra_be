import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CommonModule } from '../../shared/common/common.module';
import { ConfigModule } from '../config/config.module';
import { AppConfigService } from '../config/config.service';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { BcryptService } from './services/bcrypt.service';

@Global()
@Module({
  imports: [
    CommonModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (appConfigService: AppConfigService) => {
        return appConfigService.getJwtModuleOptions();
      },
      inject: [AppConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, BcryptService],
  exports: [BcryptService],
})
export class AuthModule {}
