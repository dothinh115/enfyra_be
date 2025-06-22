import { Global, Module } from '@nestjs/common';
import { GraphqlService } from './graphql.service';
import { DynamicResolver } from './dynamic.resolver';

@Global()
@Module({
  providers: [GraphqlService, DynamicResolver],
  exports: [GraphqlService, DynamicResolver],
})
export class GraphqlModule {}
