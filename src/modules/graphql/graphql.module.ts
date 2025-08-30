import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CommonModule } from '../../shared/common/common.module';
import { ExceptionsModule } from '../../core/exceptions/exceptions.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { DynamicModule } from '../dynamic-api/dynamic.module';
import { GraphqlService } from './services/graphql.service';
import { DynamicResolver } from './resolvers/dynamic.resolver';

@Global()
@Module({
  imports: [
    JwtModule,
    CommonModule,
    ExceptionsModule,
    RedisModule,
    DynamicModule,
  ],
  providers: [GraphqlService, DynamicResolver],
  exports: [GraphqlService, DynamicResolver],
})
export class GraphqlModule {}
