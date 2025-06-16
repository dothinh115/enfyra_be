import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { DataSourceService } from '../data-source/data-source.service';
import { CreateTableDto } from '../table/dto/create-table.dto';
import { CommonService } from '../common/common.service';
import { Table_definition } from '../entities/table_definition.entity';
import {
  TInverseRelation,
  TInverseRelationMap,
} from '../utils/types/common.type';
import { Project, QuoteKind } from 'ts-morph';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schema_history } from '../entities/schema_history.entity';

const importMap: Record<string, string> = {
  Entity: 'typeorm',
  Column: 'typeorm',
  PrimaryGeneratedColumn: 'typeorm',
  CreateDateColumn: 'typeorm',
  UpdateDateColumn: 'typeorm',
  JoinColumn: 'typeorm',
  JoinTable: 'typeorm',
  OneToOne: 'typeorm',
  OneToMany: 'typeorm',
  ManyToOne: 'typeorm',
  ManyToMany: 'typeorm',
  Unique: 'typeorm',
  Index: 'typeorm',
  HiddenField: '../decorators/hidden-field.decorator', // giả sử bạn đặt ở đây
};

@Injectable()
export class AutoService {
  private readonly logger = new Logger(AutoService.name);

  constructor(
    private commonService: CommonService,
    @Inject(forwardRef(() => DataSourceService))
    private dataSourceService: DataSourceService,
    @InjectRepository(Table_definition)
    private tableDefRepo: Repository<Table_definition>,
    @InjectRepository(Schema_history)
    private schemaHistoryRepo: Repository<Schema_history>,
  ) {}

  async entityGenerate(
    payload: CreateTableDto,
    inverseRelationMap?: TInverseRelationMap,
  ) {
    const capitalize = this.commonService.capitalize.bind(this.commonService);
    const dbTypeToTSType = this.commonService.dbTypeToTSType.bind(
      this.commonService,
    );

    const className = capitalize(payload.name);
    const entityDir = path.resolve('src', 'entities');
    const entityPath = path.resolve(
      entityDir,
      `${payload.name.toLowerCase()}.entity.ts`,
    );
    if (!fs.existsSync(entityDir)) fs.mkdirSync(entityDir, { recursive: true });

    const project = new Project({
      manipulationSettings: {
        quoteKind: QuoteKind.Single,
      },
    });

    const usedImports = new Set<string>();
    const usedEntityImports = new Set<string>();

    const sourceFile = project.createSourceFile(entityPath, '', {
      overwrite: true,
    });

    const classDecorators = [
      { name: 'Entity', arguments: [`'${payload.name.toLowerCase()}'`] },
    ];
    usedImports.add('Entity');

    for (const unique of payload.uniques || []) {
      const fields = Array.isArray(unique) ? unique : [unique];
      classDecorators.push({
        name: 'Unique',
        arguments: [`[${fields.map((f) => `'${f}'`).join(', ')}]`],
      });
      usedImports.add('Unique');
    }

    const uniqueKeySet = new Set(
      (payload.uniques || []).map((u) =>
        (Array.isArray(u) ? u : [u]).sort().join('|'),
      ),
    );

    for (const index of payload.indexes || []) {
      const fields = Array.isArray(index) ? index : [index];
      const key = fields.sort().join('|');
      if (!uniqueKeySet.has(key)) {
        classDecorators.push({
          name: 'Index',
          arguments: [`[${fields.map((f) => `'${f}'`).join(', ')}]`],
        });
        usedImports.add('Index');
      }
    }

    const classDeclaration = sourceFile.addClass({
      name: className,
      isExported: true,
      decorators: classDecorators,
    });

    for (const col of payload.columns) {
      const decorators = [];

      if (col.isPrimary) {
        const strategy = col.type === 'uuid' ? `'uuid'` : `'increment'`;
        decorators.push({
          name: 'PrimaryGeneratedColumn',
          arguments: [strategy],
        });
        usedImports.add('PrimaryGeneratedColumn');
      } else {
        const type = col.type === 'date' ? 'timestamp' : col.type;
        const opts = [`type: "${type}"`, `nullable: ${col.isNullable}`];

        if (col.default !== undefined && col.default !== null) {
          if (col.default === 'now') {
            opts.push(`default: () => "now()"`);
          } else {
            opts.push(
              typeof col.default === 'string'
                ? `default: "${col.default}"`
                : `default: ${col.default}`,
            );
          }
        }

        if (col.isUnique) opts.push(`unique: true`);
        if (col.type === 'enum' && col.enumValues) {
          opts.push(
            `enum: [${col.enumValues.map((v) => `'${v}'`).join(', ')}]`,
          );
        }
        if (col.isUpdatable === false) {
          opts.push(`update: false`);
        }

        decorators.push({
          name: 'Column',
          arguments: [`{ ${opts.join(', ')} }`],
        });
        usedImports.add('Column');

        if (col.isIndex) {
          decorators.push({ name: 'Index', arguments: [] });
          usedImports.add('Index');
        }
      }

      if (col.isHidden) {
        decorators.push({ name: 'HiddenField', arguments: [] });
        usedImports.add('HiddenField');
      }

      const tsType =
        col.type === 'enum'
          ? col.enumValues.map((v) => `'${v}'`).join(' | ')
          : col.type === 'date'
            ? 'Date'
            : dbTypeToTSType(col.type);

      classDeclaration.addProperty({
        name: col.name,
        type: tsType,
        hasExclamationToken: false,
        decorators,
      });
    }

    const generateRelation = (rel: any, isInverse = false) => {
      const typeMap = {
        'many-to-many': 'ManyToMany',
        'one-to-one': 'OneToOne',
        'many-to-one': 'ManyToOne',
        'one-to-many': 'OneToMany',
      };
      const relationType = typeMap[rel.type] || 'ManyToOne';
      usedImports.add(relationType);

      const target = capitalize(rel.targetTable?.name || rel.targetClass || '');
      if (target && target !== className) usedEntityImports.add(target);

      const propertyType = ['many-to-many', 'one-to-many'].includes(rel.type)
        ? `${target}[]`
        : target;
      const decorators = [];

      const shouldAddIndex =
        rel.isIndex &&
        (rel.type === 'many-to-one' ||
          (rel.type === 'one-to-one' && !isInverse));
      if (shouldAddIndex) {
        decorators.push({ name: 'Index', arguments: [] });
        usedImports.add('Index');
      }

      const options = [];
      if (rel.isEager) options.push('eager: true');
      if (rel.isNullable !== undefined && rel.type !== 'one-to-many')
        options.push(`nullable: ${rel.isNullable}`);
      if (
        (rel.type === 'many-to-many' && !isInverse) ||
        rel.type === 'one-to-many'
      ) {
        options.push('cascade: true');
      }
      options.push(`onDelete: 'CASCADE'`, `onUpdate: 'CASCADE'`);

      let args = [`() => ${target}`];
      if (rel.inversePropertyName) {
        args.push(`(rel) => rel.${rel.inversePropertyName}`);
      }
      if (options.length) args.push(`{ ${options.join(', ')} }`);

      decorators.push({ name: relationType, arguments: args });

      if (rel.type === 'many-to-many' && !isInverse) {
        decorators.push({ name: 'JoinTable', arguments: [] });
        usedImports.add('JoinTable');
      } else if (['many-to-one', 'one-to-one'].includes(rel.type)) {
        decorators.push({ name: 'JoinColumn', arguments: [] });
        usedImports.add('JoinColumn');
      }

      classDeclaration.addProperty({
        name: rel.propertyName,
        type: propertyType,
        decorators,
      });
    };

    for (const rel of payload.relations || []) generateRelation(rel, false);
    if (inverseRelationMap?.has(payload.name)) {
      for (const rel of inverseRelationMap.get(payload.name)!)
        generateRelation(rel, true);
      inverseRelationMap.delete(payload.name);
    }

    classDeclaration.addProperty({
      name: 'createdAt',
      type: 'Date',
      decorators: [{ name: 'CreateDateColumn', arguments: [] }],
    });
    usedImports.add('CreateDateColumn');

    classDeclaration.addProperty({
      name: 'updatedAt',
      type: 'Date',
      decorators: [{ name: 'UpdateDateColumn', arguments: [] }],
    });
    usedImports.add('UpdateDateColumn');

    // Add imports
    const groupedImports: Record<string, string[]> = {};
    for (const name of usedImports) {
      const path = importMap[name];
      if (!path) continue;
      if (!groupedImports[path]) groupedImports[path] = [];
      groupedImports[path].push(name);
    }

    for (const [moduleSpecifier, namedImports] of Object.entries(
      groupedImports,
    )) {
      sourceFile.addImportDeclaration({ namedImports, moduleSpecifier });
    }

    for (const entityName of usedEntityImports) {
      sourceFile.addImportDeclaration({
        namedImports: [entityName],
        moduleSpecifier: `./${entityName.toLowerCase()}.entity`,
      });
    }

    await sourceFile.save();
    console.log(`✅ Entity written: ${entityPath}`);
  }

  async buildToJs({
    targetDir,
    outDir,
  }: {
    targetDir: string;
    outDir: string;
  }) {
    const script = `npx node ${path.resolve('build-entities.js')} -t ${targetDir} -o ${outDir}`;
    this.logger.log('Chuẩn bị build file js');
    this.logger.log('script', script);

    try {
      execSync(script, { stdio: 'inherit' });
      this.logger.debug('Build file js thành công');
    } catch (err) {
      this.logger.error('Lỗi khi chạy shell script:', err);
    }
  }

  async generateMigrationFile() {
    const migrationDir = path.resolve('src', 'migrations', 'AutoMigration');
    const appDataSourceDir = path.resolve(
      'src',
      'data-source',
      'data-source.ts',
    );

    const needDeleteDir = path.resolve('src', 'migrations');
    this.logger.log('Chuẩn bị generate file migration');

    try {
      // Xoá toàn bộ file trong thư mục migrationDir
      if (fs.existsSync(needDeleteDir)) {
        const files = fs.readdirSync(needDeleteDir);
        for (const file of files) {
          fs.unlinkSync(path.join(needDeleteDir, file));
        }
        this.logger.log(`Đã xoá sạch thư mục ${needDeleteDir}`);
      } else {
        fs.mkdirSync(migrationDir, { recursive: true });
        this.logger.log(`Đã tạo thư mục ${migrationDir}`);
      }

      const script = `npm run typeorm -- migration:generate ${migrationDir} -d ${appDataSourceDir}`;
      execSync(script, { stdio: 'inherit' });

      this.logger.debug('Generate file migration thành công!');
    } catch (error) {
      this.logger.error('Lỗi khi chạy generate migration:', error);
    }
  }

  async runMigration() {
    this.logger.log('Chuẩn bị run migration');
    const dataSourceDir = path.resolve('src', 'data-source', 'data-source.ts');
    const script = `npm run typeorm -- migration:run -d ${dataSourceDir}`;
    this.logger.log(`Script: ${script}`);

    try {
      execSync(script, { stdio: 'inherit' });
      this.logger.debug('Run migration thành công!');
    } catch (error) {
      this.logger.error('Lỗi khi chạy shell script:', error);
    }
  }

  async clearMigrationsTable() {
    const dataSource = this.dataSourceService.getDataSource();
    const queryRunner = dataSource.createQueryRunner();

    await queryRunner.connect();

    const dbType = dataSource.options.type;

    let checkTableSql: string;

    if (dbType === 'mysql') {
      checkTableSql = `
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'migrations'
    `;
    } else if (dbType === 'postgres') {
      checkTableSql = `
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'migrations'
    `;
    } else {
      await queryRunner.release();
      throw new Error(`Unsupported database type: ${dbType}`);
    }

    const result = await queryRunner.query(checkTableSql);
    const exists = Number(result[0]?.count) > 0;

    if (exists) {
      await queryRunner.query('DELETE FROM migrations;');
      this.logger.log('✅ Đã xoá sạch dữ liệu trong bảng migrations.');
    } else {
      this.logger.warn('⚠️ Bảng migrations không tồn tại, bỏ qua xoá.');
    }

    await queryRunner.release();
  }

  async backup() {
    const tableRepo = this.dataSourceService.getRepository('table_definition');
    const tables = await tableRepo
      .createQueryBuilder('table')
      .leftJoinAndSelect('table.columns', 'columns')
      .leftJoinAndSelect('table.relations', 'relations')
      .getMany();

    const historyCount = await this.schemaHistoryRepo.count();
    if (historyCount > 20) {
      const oldest: any = await this.schemaHistoryRepo.findOne({
        where: {},
        order: { createdAt: 'ASC' },
      });
      if (oldest) {
        await this.schemaHistoryRepo.delete(oldest.id);
      }
    }
    return await this.schemaHistoryRepo.save({
      schema: tables,
    });
  }

  async restore() {
    const oldest: any = await this.schemaHistoryRepo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    if (oldest) {
      await this.tableDefRepo.save(oldest.schema);
      await this.pullMetadataFromDb();
    }
  }

  buildInverseRelationMap(allTables: any[]): TInverseRelationMap {
    const capitalize = this.commonService.capitalize;
    const inverseRelationType = this.commonService.inverseRelationType;
    const map: TInverseRelationMap = new Map();

    for (const table of allTables) {
      const tableName = table.name;
      const relations = table.relations || [];

      for (const rel of relations) {
        if (!rel.inversePropertyName || !rel.targetTable?.name) continue;

        const targetName = rel.targetTable.name;
        const inverseEntry: TInverseRelation = {
          targetClass: `${capitalize(tableName)}`,
          targetGraphQLType: `${capitalize(tableName)}Type`,
          propertyName: rel.inversePropertyName,
          inversePropertyName: rel.propertyName,
          type: inverseRelationType(rel.type),
          isIndex: rel.isIndex,
        };

        if (!map.has(targetName)) map.set(targetName, []);
        map.get(targetName)!.push(inverseEntry);
      }
    }

    return map;
  }

  async pullMetadataFromDb() {
    const tables: any = await this.tableDefRepo
      .createQueryBuilder('table')
      .leftJoinAndSelect('table.columns', 'columns')
      .leftJoinAndSelect('table.relations', 'relations')
      .leftJoinAndSelect('relations.targetTable', 'targetTable')
      .getMany();
    if (tables.length === 0) return;
    tables.forEach((table) => {
      table.columns.sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return a.name.localeCompare(b.name);
      });

      table.relations.sort((a, b) =>
        a.propertyName.localeCompare(b.propertyName),
      );
    });

    const inverseRelationMap = this.buildInverseRelationMap(tables);

    const entityDir = path.resolve('src', 'entities');
    const distEntityDir = path.resolve('dist', 'entities');

    const validFileNames = tables.map(
      (table) => `${table.name.toLowerCase()}.entity.ts`,
    );

    // Xoá file .ts không hợp lệ trong src/entities
    const existingFiles = fs.readdirSync(entityDir);
    for (const file of existingFiles) {
      if (!file.endsWith('.entity.ts')) continue;
      if (!validFileNames.includes(file)) {
        const fullPath = path.join(entityDir, file);
        fs.unlinkSync(fullPath);
        this.logger.warn(`🗑️ Đã xoá entity không hợp lệ: ${file}`);
      }
    }

    // Xoá file .js tương ứng trong dist/entities
    if (fs.existsSync(distEntityDir)) {
      const distFiles = fs.readdirSync(distEntityDir);
      for (const file of distFiles) {
        if (!file.endsWith('.entity.js')) continue;
        const correspondingTsFile = file.replace(/\.js$/, '.ts');
        if (!validFileNames.includes(correspondingTsFile)) {
          const fullPath = path.join(distEntityDir, file);
          fs.unlinkSync(fullPath);
          this.logger.warn(`🗑️ Đã xoá JS không hợp lệ: ${file}`);
        }
      }
    }

    await Promise.all(
      tables.map(
        async (table) => await this.entityGenerate(table, inverseRelationMap),
      ),
    );

    // this.logger.log(`Chuẩn bị fix import`);
    // await this.autoFixMissingImports(
    //   [path.resolve('src', 'entities')],
    //   [path.resolve('src', 'entities'), path.resolve('src', 'decorators')],
    // );
    // this.logger.debug(`Đã fix import xong`);

    await this.buildToJs({
      targetDir: path.resolve('src/entities'),
      outDir: path.resolve('dist/entities'),
    });
    await this.dataSourceService.reloadDataSource();
    await this.generateMigrationFile();
    await this.runMigration();
  }

  async autoFixMissingImports(targetDirs: string[], scanDirs: string[]) {
    const autoImportFilePath = path.resolve('auto-import.js');
    const script = `node ${autoImportFilePath} --target ${targetDirs.join(' ')} --scan ${scanDirs.join(' ')}`;
    try {
      execSync(script, { stdio: 'inherit' });
    } catch (error) {
      console.log(`Lỗi khi chạy script: `, error.message);
    }
  }
}
