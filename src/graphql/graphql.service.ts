import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { createYoga } from 'graphql-yoga';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { GraphQLSchema } from 'graphql';
import { EntityMetadata } from 'typeorm';
import { generateTypeDefsFromTables } from './utils/generate-type-defs';
import { DynamicResolver } from './dynamic.resolver';

@Injectable()
export class GraphqlService implements OnApplicationBootstrap {
  constructor(
    private dataSourceService: DataSourceService,
    private dynamicResolver: DynamicResolver,
  ) {}
  async onApplicationBootstrap() {
    await this.reloadSchema();
  }
  private yogaApp: ReturnType<typeof createYoga>;

  private async pullMetadataFromDb(): Promise<any[]> {
    const dataSource = this.dataSourceService.getDataSource();
    const tableDefRepo = dataSource.getRepository('table_definition');
    const rootMeta = dataSource.getMetadata('table_definition');

    const qb = tableDefRepo.createQueryBuilder('table');
    qb.leftJoinAndSelect('table.columns', 'columns');
    qb.leftJoinAndSelect('table.relations', 'relations');
    qb.leftJoinAndSelect('relations.targetTable', 'targetTable');

    const aliasMap = new Map<string, string>();
    const visited = new Set<number>();

    function walk(meta: EntityMetadata, path: string[], alias: string) {
      const tableId = meta.tableName;
      if (visited.has(tableId as any)) return;

      visited.add(tableId as any);

      for (const rel of meta.relations) {
        const relPath = [...path, rel.propertyName];
        const aliasKey = ['table', ...relPath].join('_');
        const joinPath = `${alias}.${rel.propertyName}`;

        if (!aliasMap.has(aliasKey)) {
          aliasMap.set(aliasKey, aliasKey);
          qb.leftJoinAndSelect(joinPath, aliasKey);
          walk(rel.inverseEntityMetadata, relPath, aliasKey);
        }
      }

      visited.delete(tableId as any);
    }

    walk(rootMeta, [], 'table');

    return await qb.getMany();
  }

  private async schemaGenerator(): Promise<GraphQLSchema> {
    const tables = await this.pullMetadataFromDb();
    const metadatas = this.dataSourceService.getDataSource().entityMetadatas;
    const typeDefs = generateTypeDefsFromTables(tables, metadatas);

    const resolvers = {
      Query: new Proxy(
        {},
        {
          get: (_target, propName: string) => {
            return async (parent, args, ctx, info) => {
              return await this.dynamicResolver.dynamicResolver(
                propName,
                args,
                ctx,
                info,
              );
            };
          },
        },
      ),
    };

    return makeExecutableSchema({
      typeDefs,
      resolvers,
    });
  }

  async reloadSchema() {
    try {
      const schema = await this.schemaGenerator();

      this.yogaApp = createYoga({
        schema,
        graphqlEndpoint: '/graphql',
        graphiql: true,
      });
    } catch (error) {
      console.error('Error reloading GraphQL schema:', error);
      throw error;
    }
  }

  getYogaInstance() {
    if (!this.yogaApp) {
      throw new Error('GraphQL Yoga instance not initialized. Call reloadSchema() first.');
    }
    return this.yogaApp;
  }
}
