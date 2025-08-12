import { Module } from '@nestjs/common';
import { MeService } from './services/me.service';
import { MeController } from './controllers/me.controller';

@Module({
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
