import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { exec, execSync } from 'child_process';
import { DataSourceService } from '../data-source/data-source.service';
import { CreateTableDto } from '../table/dto/create-table.dto';
import { CommonService } from '../common/common.service';
import { Table_definition } from '../entities/table_definition.entity';
import { DataSource } from 'typeorm';
import { TInverseRelation, TInverseRelationMap } from '../utils/type';

@Injectable()
export class AutoService {
  private readonly logger = new Logger(AutoService.name);

  constructor(
    private commonService: CommonService,
    @Inject(forwardRef(() => DataSourceService))
    private dataSourceService: DataSourceService,
  ) {}

  buildInverseRelationMap() {
    return new Map<string, TInverseRelation[]>();
  }

  async entityAutoGenerate(
    payload: any,
    inverseRelationMap?: TInverseRelationMap,
  ) {
    const className = this.commonService.capitalize(payload.name);
    let code = `@Entity('${payload.name.toLowerCase()}')\n`;

    if (payload.unique?.length) {
      const uniques = payload.unique.map((u) => `"${u}"`).join(', ');
      code += `@Unique([${uniques}])\n`;
    }

    if (payload.index?.length) {
      const uniqueKeys = (payload.unique || []).map((u) =>
        [...u.value].sort().join('|'),
      );
      for (const index of payload.index) {
        const key = [...index.value].sort().join('|');
        if (!uniqueKeys.includes(key)) {
          const indexFields = index.value.map((v) => `"${v}"`).join(', ');
          code += `@Index([${indexFields}])\n`;
        }
      }
    }

    code += `export class ${className} {\n`;

    for (const col of payload.columns) {
      if (col.isPrimary) {
        const strategy = col.type === 'uuid' ? `'uuid'` : `'increment'`;
        code += `  @PrimaryGeneratedColumn(${strategy})\n`;
      } else {
        const options = [`type: "${col.type}"`, `nullable: ${col.isNullable}`];
        if (col.isUnique) options.push('unique: true');
        if (col.type === 'enum' && col.enumValues)
          options.push(
            `enum: [${col.enumValues.map((v) => `'${v}'`).join(', ')}]`,
          );
        if (col.default !== undefined && col.default !== null) {
          if (typeof col.default === 'string')
            options.push(`default: "${col.default}"`);
          else options.push(`default: ${col.default}`);
        }
        code += `  @Column({ ${options.join(', ')} })\n`;
        if (col.index) code += `  @Index()\n`;
      }
      const tsType =
        col.type === 'enum'
          ? col.enumValues.map((v) => `'${v}'`).join(' | ')
          : this.commonService.dbTypeToTSType(col.type);
      code += `  ${col.name}: ${tsType};\n\n`;
    }

    if (payload.relations?.length) {
      for (const rel of payload.relations) {
        const target = this.commonService.capitalize(
          rel.targetTable?.name || '',
        );
        const typeMap = {
          'many-to-many': 'ManyToMany',
          'one-to-one': 'OneToOne',
          'many-to-one': 'ManyToOne',
          'one-to-many': 'OneToMany',
        };
        const type = typeMap[rel.type] || 'ManyToOne';
        const options = [];
        if (rel.isEager) options.push('eager: true');
        if (rel.isNullable !== undefined && rel.type !== 'one-to-many')
          options.push(`nullable: ${rel.isNullable}`);
        if (['many-to-many', 'one-to-many'].includes(rel.type))
          options.push('cascade: true');
        options.push(`onDelete: 'CASCADE'`, `onUpdate: 'CASCADE'`);
        const optionsBlock = options.length
          ? `, { ${options.join(', ')} }`
          : '';

        code += `  @${type}(() => ${target}${rel.inversePropertyName ? `, rel => rel.${rel.inversePropertyName}` : ''}${optionsBlock})\n`;

        if (rel.type === 'many-to-many') {
          if (inverseRelationMap && !inverseRelationMap.has(payload.name)) {
            code += `  @JoinTable()\n`;
          }
        } else if (['many-to-one', 'one-to-one'].includes(rel.type)) {
          code += `  @JoinColumn()\n`;
        }

        const suffix = ['many-to-many', 'one-to-many'].includes(rel.type)
          ? '[]'
          : '';
        code += `  ${rel.propertyName}: ${target}${suffix};\n\n`;
      }
    }

    if (inverseRelationMap?.has(payload.name)) {
      const inverseRelations = inverseRelationMap.get(payload.name);
      for (const rel of inverseRelations) {
        const type =
          rel.type === 'many-to-many'
            ? 'ManyToMany'
            : rel.type === 'one-to-one'
              ? 'OneToOne'
              : rel.type === 'many-to-one'
                ? 'ManyToOne'
                : 'OneToMany';
        const options = [];
        if (['many-to-many', 'one-to-many'].includes(rel.type))
          options.push('cascade: true');
        if (rel.isEager) options.push('eager: true');
        options.push(`onDelete: 'CASCADE'`, `onUpdate: 'CASCADE'`);
        const optionBlock = options.length ? `, { ${options.join(', ')} }` : '';

        code += `  @${type}(() => ${rel.targetClass}, rel => rel.${rel.inversePropertyName}${optionBlock})\n`;
        if (rel.type === 'many-to-one') code += `  @JoinColumn()\n`;

        const suffix = ['many-to-many', 'one-to-many'].includes(rel.type)
          ? '[]'
          : '';
        code += `  ${rel.propertyName}: ${rel.targetClass}${suffix};\n\n`;
      }
      inverseRelationMap.delete(payload.name);
    }

    code += `  @CreateDateColumn()\n  createdAt: Date;\n\n`;
    code += `  @UpdateDateColumn()\n  updatedAt: Date;\n`;
    code += `}\n`;

    // 🔽 Ghi file
    const entityDir = path.resolve('src', 'entities');
    const entityPath = path.resolve(
      entityDir,
      `${payload.name.toLowerCase()}.entity.ts`,
    );

    // Đảm bảo thư mục tồn tại
    if (!fs.existsSync(entityDir)) {
      fs.mkdirSync(entityDir, { recursive: true });
    }

    fs.writeFileSync(entityPath, code);
    this.logger?.log(`✅ Ghi entity file thành công: ${entityPath}`);

    return code;
  }

  async autoBuildToJs() {
    const filePath = path.resolve('build-entities.ts');
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

  async autoGenerateMigrationFile() {
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

  async autoRunMigration() {
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

  async afterEffect() {
    try {
      await this.autoBuildToJs();
      await this.autoGenerateMigrationFile();
      await this.clearMigrationsTable();
      await this.autoRunMigration();
    } catch (error) {
      this.logger.error('Lỗi trong afterEffect:', error);
      throw error;
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

  getEntityClassByTableName(
    dataSource: DataSource,
    tableName: string,
  ): Function | undefined {
    const entityMetadata = dataSource.entityMetadatas.find(
      (meta) =>
        meta.tableName === tableName || meta.givenTableName === tableName,
    );

    return entityMetadata?.target as Function | undefined;
  }

  async getInverseRelationMetadatas(
    inverseRelationMap: TInverseRelationMap,
    tables: CreateTableDto[],
  ) {
    for (const table of tables) {
      for (const relation of table.relations) {
        if (relation.inversePropertyName) {
          let type = 'one-to-one';
          if (relation.type === 'many-to-many') type = 'many-to-many';
          if (relation.type === 'one-to-many') type = 'many-to-one';
          if (relation.type === 'many-to-one') type = 'one-to-many';

          const repo =
            this.dataSourceService.getRepository<Table_definition>(
              Table_definition,
            );
          const targetTable = await repo.findOne({
            where: {
              id: (relation.targetTable as any).id,
            },
          });
          if (!targetTable) {
            this.logger.warn(
              `Không tìm thấy targetTable cho relation ${relation.propertyName} trong bảng ${table.name}`,
            );
            continue;
          }
          const existed = inverseRelationMap.get(targetTable.name) ?? [];

          inverseRelationMap.set(targetTable.name, [
            ...existed,
            {
              propertyName: relation.inversePropertyName,
              inversePropertyName: relation.propertyName,
              type,
              isEager: relation.isInverseEager,
              isNullable: relation.isNullable,
              index: relation.index,
              targetClass: this.commonService.capitalize(table.name),
            },
          ]);
        }
      }
    }
  }

  async backup(payload: any) {
    const scriptPath = path.resolve('get-snapshot.js');
    try {
      const filePath = path.resolve('schema-from-db.json');
      const jsonStr = JSON.stringify(payload, null, 2);
      fs.writeFileSync(filePath, jsonStr, { encoding: 'utf-8' });
      execSync(`node ${scriptPath}`, { encoding: 'utf-8' });
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

  async pullMetadataFromDb() {
    const tableRepo = this.dataSourceService.getRepository(Table_definition);

    let tables: any[] = await tableRepo.find({
      relations: ['relations', 'relations.targetTable', 'columns'],
    });

    const test = tables.find((table) => table === 'table_alias_definition');
    console.dir(test, { depth: null });

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

    const inverseRelationMap = this.buildInverseRelationMap();
    await this.getInverseRelationMetadatas(inverseRelationMap, tables);

    await Promise.all(
      tables.map(
        async (table) =>
          await this.entityAutoGenerate(table, inverseRelationMap),
      ),
    );

    this.logger.log(`Chuẩn bị fix import`);
    await this.commonService.autoFixMissingImports(
      path.resolve('src', 'entities'),
    );
    this.logger.debug(`Đã fix import xong`);

    // this.logger.log(`Test logic file vừa generate`);
    // this.commonService.checkTsErrors(path.resolve('src', 'entities'));
    // this.logger.debug(`Ko có lỗi ts, file dc giữ nguyên...`);
    await this.autoBuildToJs();
    await this.dataSourceService.reloadDataSource();
    await this.autoGenerateMigrationFile();
    await this.autoRunMigration();

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
}
