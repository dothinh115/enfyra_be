import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DynamicService } from './dynamic.service';
import { DynamicController } from './dynamic.controller';
import { DynamicMiddleware } from '../middleware/dynamic.middleware';
import { RouteDetectMiddleware } from '../middleware/route-detect.middleware';

@Module({
  imports: [],
  controllers: [DynamicController],
  providers: [DynamicService],
})
export class DynamicModule implements NestModule {
  async configure(consumer: MiddlewareConsumer) {
    consumer.apply(RouteDetectMiddleware).forRoutes(DynamicController);
    consumer.apply(DynamicMiddleware).forRoutes(DynamicController);
  }
}
