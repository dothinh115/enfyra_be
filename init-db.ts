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

  if (DB_TYPE !== 'mysql') {
    console.log(
      `⚠️ Đang dùng ${DB_TYPE}, bạn phải tạo database '${DB_NAME}' thủ công.`,
    );
    return;
  }

  const tempDataSource = new DataSource({
    type: 'mysql',
    host: DB_HOST,
    port: DB_PORT,
    username: DB_USERNAME,
    password: DB_PASSWORD,
  });

  await tempDataSource.initialize();
  const queryRunner = tempDataSource.createQueryRunner();

  const result = await queryRunner.query(
    `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
    [DB_NAME],
  );
  const dbExists = result.length > 0;

  if (!dbExists) {
    await queryRunner.query(`CREATE DATABASE \`${DB_NAME}\``);
    console.log(`✅ Đã tạo database '${DB_NAME}' (MySQL).`);
  } else {
    console.log(`✅ Database '${DB_NAME}' đã tồn tại (MySQL).`);
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
          `type: '${col.type === 'date' ? 'datetime' : col.type}'`,
          `nullable: ${col.isNullable === false ? 'false' : 'true'}`,
        ];

        if (col.isUnique) opts.push('unique: true');

        if (col.default !== undefined && col.default !== null) {
          if (
            typeof col.default === 'string' &&
            col.default.toLowerCase() === 'now'
          ) {
            opts.push(`default: () => 'CURRENT_TIMESTAMP'`);
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

      const cascadeOpts = ['onDelete: "CASCADE"', 'onUpdate: "CASCADE"'];

      const isInverse = !!rel.targetClass;

      if (!isInverse && ['many-to-many'].includes(rel.type)) {
        cascadeOpts.unshift('cascade: true');
      }

      const args = [`'${target}'`];
      if (rel.inversePropertyName) {
        args.push(`(rel: any) => rel.${rel.inversePropertyName}`);
      }
      args.push(`{ ${cascadeOpts.join(', ')} }`);

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
  await writeEntitiesFromSnapshot();
  await ensureDatabaseExists();

  const dataSource = new DataSource({
    type: process.env.DB_TYPE as 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dynamiq',
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
