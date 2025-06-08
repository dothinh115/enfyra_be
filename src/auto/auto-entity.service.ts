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

@Injectable()
export class AutoService {
  private readonly logger = new Logger(AutoService.name);

  constructor(
    private commonService: CommonService,
    @Inject(forwardRef(() => DataSourceService))
    private dataSourceService: DataSourceService,
  ) {}

  async entityGenerate(
    payload: CreateTableDto,
    inverseRelationMap?: TInverseRelationMap,
  ) {
    const capitalize = this.commonService.capitalize;
    const dbTypeToTSType = this.commonService.dbTypeToTSType;
    const className = capitalize(payload.name);
    let code = `@Entity('${payload.name.toLowerCase()}')\n`;

    // Unique
    if (payload.uniques?.length) {
      for (const unique of payload.uniques) {
        const fields = Array.isArray(unique) ? unique : [unique];
        code += `@Unique([${fields.map((f) => `"${f}"`).join(', ')}])\n`;
      }
    }

    // Index
    const uniqueKeySet = new Set(
      (payload.uniques || []).map((u) =>
        (Array.isArray(u) ? u : [u]).sort().join('|'),
      ),
    );

    if (payload.indexes?.length) {
      for (const index of payload.indexes) {
        const fields = Array.isArray(index) ? index : [index];
        const key = fields.sort().join('|');
        if (!uniqueKeySet.has(key)) {
          code += `@Index([${fields.map((f) => `"${f}"`).join(', ')}])\n`;
        }
      }
    }

    code += `export class ${className} {\n`;

    // Columns
    for (const col of payload.columns) {
      if (col.isPrimary) {
        const strategy = col.type === 'uuid' ? `'uuid'` : `'increment'`;
        code += `  @PrimaryGeneratedColumn(${strategy})\n`;
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
        if (col.type === 'enum' && col.enumValues)
          opts.push(
            `enum: [${col.enumValues.map((v) => `'${v}'`).join(', ')}]`,
          );

        if (col.isUpdatable === false) {
          opts.push('update: false');
        }

        code += `  @Column({ ${opts.join(', ')} })\n`;
        if (col.isIndex) code += `  @Index()\n`;
      }

      if (col.isHidden) {
        code += `  @HiddenField()\n`;
      }

      const tsType =
        col.type === 'enum'
          ? col.enumValues.map((v) => `'${v}'`).join(' | ')
          : col.type === 'date'
            ? 'Date'
            : dbTypeToTSType(col.type);

      code += `  ${col.name}: ${tsType};\n\n`;
    }

    // Relation generator
    const generateRelation = (rel: any, isInverse = false) => {
      const typeMap = {
        'many-to-many': 'ManyToMany',
        'one-to-one': 'OneToOne',
        'many-to-one': 'ManyToOne',
        'one-to-many': 'OneToMany',
      };
      const type = typeMap[rel.type] || 'ManyToOne';
      const target = capitalize(rel.targetTable?.name || rel.targetClass || '');

      if (!target) {
        console.warn(`⚠️ Missing target for relation:`, rel);
        return '';
      }

      const opts = [];
      if (rel.isEager) opts.push('eager: true');
      if (rel.isNullable !== undefined && rel.type !== 'one-to-many')
        opts.push(`nullable: ${rel.isNullable}`);
      if (['many-to-many', 'many-to-one'].includes(rel.type) && !isInverse)
        opts.push(`cascade: true`);
      opts.push(`onDelete: 'CASCADE'`, `onUpdate: 'CASCADE'`);
      const optStr = opts.length ? `, { ${opts.join(', ')} }` : '';

      let relationCode = '';
      if (
        rel.isIndex &&
        (rel.type === 'many-to-one' ||
          (rel.type === 'one-to-one' && !isInverse))
      ) {
        relationCode += `  @Index()\n`;
      }

      relationCode += `  @${type}(() => ${target}`;
      if (rel.inversePropertyName) {
        relationCode += `, rel => rel.${rel.inversePropertyName}`;
      }
      relationCode += `${optStr})\n`;

      if (rel.type === 'many-to-many' && !isInverse) {
        relationCode += `  @JoinTable()\n`;
      } else if (['many-to-one', 'one-to-one'].includes(rel.type)) {
        relationCode += `  @JoinColumn()\n`;
      }

      const suffix = ['many-to-many', 'one-to-many'].includes(rel.type)
        ? '[]'
        : '';
      relationCode += `  ${rel.propertyName}: ${target}${suffix};\n\n`;

      return relationCode;
    };

    // Normal relations
    for (const rel of payload.relations || []) {
      code += generateRelation(rel);
    }

    // Inverse relations
    if (inverseRelationMap?.has(payload.name)) {
      const inverseRelations = inverseRelationMap.get(payload.name);
      for (const rel of inverseRelations) {
        code += generateRelation(rel, true);
      }
      inverseRelationMap.delete(payload.name);
    }

    // Timestamps
    code += `  @CreateDateColumn()\n  createdAt: Date;\n\n`;
    code += `  @UpdateDateColumn()\n  updatedAt: Date;\n`;
    code += `}\n`;

    // Write to file
    const entityDir = path.resolve('src', 'entities');
    const entityPath = path.resolve(
      entityDir,
      `${payload.name.toLowerCase()}.entity.ts`,
    );
    if (!fs.existsSync(entityDir)) fs.mkdirSync(entityDir, { recursive: true });
    fs.writeFileSync(entityPath, code);

    console.log(`✅ Ghi entity file thành công: ${entityPath}`);
    return code;
  }

  async buildToJs(filePath: string) {
    const script = `npx ts-node ${filePath}`;
    this.logger.log('Chuẩn bị build file js');
    this.logger.log('script', script);

    try {
      execSync(script, { stdio: 'inherit' });
      this.logger.debug('Build file js thành công: ', filePath);
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
    const dataSource = await this.dataSourceService.getDataSource();
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

  async backup(payload: any) {
    const scriptPath = path.resolve('get-snapshot.js');
    try {
      const filePath = path.resolve('schema-from-db.json');
      const jsonStr = JSON.stringify(payload, null, 2);
      fs.writeFileSync(filePath, jsonStr, { encoding: 'utf-8' });
    } catch (err) {
      this.logger.error('Lỗi khi chạy shell script:', err);
    }
  }

  async restore() {
    try {
      execSync(
        `node ${path.resolve('get-snapshot.js')} && node ${path.resolve('get-entities.js')} && node ${path.resolve('auto-import.js')}`,
        { stdio: 'inherit' },
      );
    } catch (err) {
      this.logger.error('Lỗi khi chạy shell script:', err);
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
          isIndex: rel.isInverseIndex,
        };

        if (!map.has(targetName)) map.set(targetName, []);
        map.get(targetName)!.push(inverseEntry);
      }
    }

    return map;
  }

  async pullMetadataFromDb() {
    await this.commonService.delay(1000);
    const tableRepo =
      await this.dataSourceService.getRepository(Table_definition);

    let tables: any[] = await tableRepo.find({
      relations: ['relations', 'relations.targetTable', 'columns'],
    });

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

    await Promise.all(
      tables.map(
        async (table) => await this.entityGenerate(table, inverseRelationMap),
      ),
    );

    this.logger.log(`Chuẩn bị fix import`);
    await this.autoFixMissingImports(
      [path.resolve('src', 'entities')],
      [path.resolve('src', 'entities'), path.resolve('src', 'decorators')],
    );
    this.logger.debug(`Đã fix import xong`);

    // this.logger.log(`Test logic file vừa generate`);
    // this.commonService.checkTsErrors(path.resolve('src', 'entities'));
    // this.logger.debug(`Ko có lỗi ts, file dc giữ nguyên...`);
    await this.buildToJs(path.resolve('build-entities.ts'));
    await this.dataSourceService.reloadDataSource();
    await this.generateMigrationFile();
    await this.runMigration();

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
