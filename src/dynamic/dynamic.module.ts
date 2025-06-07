import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DynamicService } from './dynamic.service';
import { DynamicController } from './dynamic.controller';
import { DynamicMiddleware } from '../middleware/dynamic.service';

@Module({
  imports: [],
  controllers: [DynamicController],
  providers: [DynamicService],
})
export class DynamicModule implements NestModule {
  async configure(consumer: MiddlewareConsumer) {
    consumer.apply(DynamicMiddleware).forRoutes('*');
  }
}
