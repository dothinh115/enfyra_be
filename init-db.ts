import 'reflect-metadata';
import { Project, QuoteKind } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const metadata = JSON.parse(
  fs.readFileSync(path.resolve('./snapshot.json'), 'utf8'),
);

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const dbTypeToTSType = (dbType: string): string => {
  const map: Record<string, string> = {
    int: 'number',
    integer: 'number',
    smallint: 'number',
    bigint: 'number',
    decimal: 'number',
    numeric: 'number',
    float: 'number',
    double: 'number',
    real: 'number',
    boolean: 'boolean',
    bool: 'boolean',
    varchar: 'string',
    text: 'string',
    uuid: 'string',
    enum: 'string',
    'simple-json': 'any',
  };
  return map[dbType] || 'any';
};

function buildInverseRelationMap() {
  const inverseMap = new Map<string, any[]>();

  for (const [tableName, def] of Object.entries(metadata)) {
    for (const rel of (def as any).relations || []) {
      if (!rel.inversePropertyName) continue;
      const target = rel.targetTable;
      if (!metadata[target]) continue;

      const targetList = inverseMap.get(target) || [];
      let inverseType = 'one-to-one';
      if (rel.type === 'many-to-many') inverseType = 'many-to-many';
      else if (rel.type === 'many-to-one') inverseType = 'one-to-many';
      else if (rel.type === 'one-to-many') inverseType = 'many-to-one';

      targetList.push({
        type: inverseType,
        targetClass: capitalize(tableName),
        propertyName: rel.inversePropertyName,
        inversePropertyName: rel.propertyName,
      });

      inverseMap.set(target, targetList);
    }
  }

  return inverseMap;
}

async function ensureDatabaseExists() {
  const DB_TYPE = process.env.DB_TYPE || 'mysql';
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT =
    Number(process.env.DB_PORT) || (DB_TYPE === 'postgres' ? 5432 : 3306);
  const DB_USERNAME = process.env.DB_USERNAME || 'root';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const DB_NAME = process.env.DB_NAME || 'dynamiq';

  const tempDataSource = new DataSource({
    type: DB_TYPE as 'mysql',
    host: DB_HOST,
    port: DB_PORT,
    username: DB_USERNAME,
    password: DB_PASSWORD,
  });

  await tempDataSource.initialize();
  const queryRunner = tempDataSource.createQueryRunner();

  if (DB_TYPE === 'mysql') {
    const checkDb = await tempDataSource.query(`
        SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${DB_NAME}'
    `);
    if (checkDb.length === 0) {
      await tempDataSource.query(
        `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``,
      );
      console.log(`✅ MySQL: Created database ${DB_NAME}`);
    } else {
      console.log(`✅ MySQL: Database ${DB_NAME} already exists`);
    }
  } else if (DB_TYPE === 'postgres') {
    const checkDb = await tempDataSource.query(`
        SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'
    `);
    if (checkDb.length === 0) {
      await tempDataSource.query(
        `CREATE DATABASE "${DB_NAME}" WITH ENCODING 'UTF8'`,
      );
      console.log(`✅ Postgres: Created database ${DB_NAME}`);
    } else {
      console.log(`✅ Postgres: Database ${DB_NAME} already exists`);
    }
  } else {
    throw new Error(`Unsupported DB_TYPE: ${DB_NAME}`);
  }

  await queryRunner.release();
  await tempDataSource.destroy();
}

async function writeEntitiesFromSnapshot() {
  const inverseMap = buildInverseRelationMap();
  const project = new Project({
    manipulationSettings: { quoteKind: QuoteKind.Single },
  });

  const entitiesDir = path.resolve('src/entities');

  if (!fs.existsSync(entitiesDir))
    fs.mkdirSync(entitiesDir, { recursive: true });

  for (const [tableName, def] of Object.entries(metadata)) {
    const className = capitalize(tableName);
    const sourceFile = project.createSourceFile(
      path.join(entitiesDir, `${tableName}.entity.ts`),
      '',
      { overwrite: true },
    );

    const usedImports = new Set([
      'Entity',
      'Column',
      'CreateDateColumn',
      'UpdateDateColumn',
    ]);

    const classDeclaration = sourceFile.addClass({
      name: className,
      isExported: true,
      decorators: [{ name: 'Entity', arguments: [`'${tableName}'`] }],
    });

    for (const uniqueGroup of (def as any).uniques || []) {
      if (Array.isArray(uniqueGroup) && uniqueGroup.length) {
        classDeclaration.addDecorator({
          name: 'Unique',
          arguments: [
            `[${uniqueGroup.map((f: string) => `'${f}'`).join(', ')}]`,
          ],
        });
        usedImports.add('Unique');
      }
    }

    for (const indexGroup of (def as any).indexes || []) {
      if (Array.isArray(indexGroup) && indexGroup.length > 1) {
        classDeclaration.addDecorator({
          name: 'Index',
          arguments: [
            `[${indexGroup.map((f: string) => `'${f}'`).join(', ')}]`,
          ],
        });
        usedImports.add('Index');
      }
    }

    for (const col of (def as any).columns) {
      const decorators: any[] = [];

      if (col.isPrimary && col.isGenerated) {
        decorators.push({
          name: 'PrimaryGeneratedColumn',
          arguments: [col.type === 'uuid' ? `'uuid'` : `'increment'`],
        });
        usedImports.add('PrimaryGeneratedColumn');
      } else {
        const opts = [
          `type: '${col.type === 'date' ? 'timestamp' : col.type}'`,
          `nullable: ${col.isNullable === false ? 'false' : 'true'}`,
        ];

        if (col.isUnique) opts.push('unique: true');

        if (col.default !== undefined && col.default !== null) {
          if (
            typeof col.default === 'string' &&
            col.default.toLowerCase() === 'now'
          ) {
            opts.push(`default: () => 'now()'`);
          } else if (typeof col.default === 'string') {
            opts.push(`default: '${col.default}'`);
          } else {
            opts.push(`default: ${col.default}`);
          }
        }

        if (col.type === 'enum' && Array.isArray(col.enumValues)) {
          opts.push(
            `enum: [${col.enumValues.map((v: string) => `'${v}'`).join(', ')}]`,
          );
        }

        if (col.isUpdatable === false) opts.push('update: false');

        decorators.push({
          name: 'Column',
          arguments: [`{ ${opts.join(', ')} }`],
        });
        usedImports.add('Column');
      }

      classDeclaration.addProperty({
        name: col.name,
        type: col.type === 'date' ? 'Date' : dbTypeToTSType(col.type),
        decorators,
      });
    }

    const allRelations = [
      ...((def as any).relations || []),
      ...(inverseMap.get(tableName) || []),
    ];

    for (const rel of allRelations) {
      const target = rel.targetTable
        ? capitalize(rel.targetTable)
        : rel.targetClass;
      const relType = {
        'many-to-one': 'ManyToOne',
        'one-to-one': 'OneToOne',
        'one-to-many': 'OneToMany',
        'many-to-many': 'ManyToMany',
      }[rel.type];

      usedImports.add(relType);

      const relationOpts = [
        `onDelete: "${rel.onDelete || 'CASCADE'}"`,
        `onUpdate: "${rel.onUpdate || 'CASCADE'}"`,
        `nullable: ${rel.isNullable === false ? 'false' : 'true'}`,
      ];

      const isInverse = !!rel.targetClass;

      if (!isInverse && ['many-to-many'].includes(rel.type)) {
        relationOpts.unshift('cascade: true');
      }

      const args = [`'${target}'`];
      if (rel.inversePropertyName) {
        args.push(`(rel: any) => rel.${rel.inversePropertyName}`);
      }
      args.push(`{ ${relationOpts.join(', ')} }`);

      const decorators: any[] = [];

      if (
        rel.isIndex &&
        ['many-to-one', 'one-to-one'].includes(rel.type) &&
        !isInverse
      ) {
        decorators.push({ name: 'Index', arguments: [] });
        usedImports.add('Index');
      }

      decorators.push({ name: relType, arguments: args });

      if (['many-to-one', 'one-to-one'].includes(rel.type)) {
        decorators.push({ name: 'JoinColumn', arguments: [] });
        usedImports.add('JoinColumn');
      }

      if (rel.type === 'many-to-many' && !isInverse) {
        decorators.push({ name: 'JoinTable', arguments: [] });
        usedImports.add('JoinTable');
      }

      classDeclaration.addProperty({
        name: rel.propertyName,
        type: 'any',
        decorators,
      });
    }

    classDeclaration.addProperty({
      name: 'createdAt',
      type: 'Date',
      decorators: [{ name: 'CreateDateColumn', arguments: [] }],
    });

    classDeclaration.addProperty({
      name: 'updatedAt',
      type: 'Date',
      decorators: [{ name: 'UpdateDateColumn', arguments: [] }],
    });

    sourceFile.addImportDeclaration({
      namedImports: Array.from(usedImports).sort(),
      moduleSpecifier: 'typeorm',
    });
  }

  await Promise.all(project.getSourceFiles().map((file) => file.save()));
  console.log('✅ Entity generation completed.');
}

async function main() {
  const DB_TYPE = process.env.DB_TYPE as 'mysql';
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT = parseInt(process.env.DB_PORT || '3306');
  const DB_USERNAME = process.env.DB_USERNAME || 'root';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const DB_NAME = process.env.DB_NAME || 'dynamiq';

  await ensureDatabaseExists();

  const checkDS = new DataSource({
    type: DB_TYPE,
    host: DB_HOST,
    port: DB_PORT,
    username: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_NAME,
  });

  await checkDS.initialize();

  const queryRunner = checkDS.createQueryRunner();
  try {
    const [result] = await queryRunner.query(
      `SELECT isInit FROM setting_definition LIMIT 1`,
    );

    if (result?.isInit === true || result?.isInit === 1) {
      console.log('⚠️ Đã init trước đó, bỏ qua bước init.');
      await queryRunner.release();
      await checkDS.destroy();
      return;
    }
  } catch (err) {
    // Nếu bảng chưa tồn tại thì cứ tiếp tục init
    console.log(
      '🔄 Bảng setting_definition chưa tồn tại hoặc chưa có dữ liệu.',
    );
  }

  await queryRunner.release();
  await checkDS.destroy();

  await writeEntitiesFromSnapshot();
  await ensureDatabaseExists();

  const dataSource = new DataSource({
    type: DB_TYPE,
    host: DB_HOST,
    port: DB_PORT,
    username: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_NAME,
    entities: [path.resolve('src/entities/*.entity.ts')],
    synchronize: true,
    logging: false,
  });

  await dataSource.initialize();
  console.log('✅ Database schema created from generated entities.');
  await dataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
