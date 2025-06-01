import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { DataSourceService } from '../data-source/data-source.service';
import { CreateTableDto } from '../table/dto/create-table.dto';
import { CommonService } from '../common/common.service';
import { TableDefinition } from '../entities/table.entity';
import { DataSource } from 'typeorm';
import { TStaticEntities } from '../utils/type';

@Injectable()
export class AutoService {
  private readonly logger = new Logger(AutoService.name);

  constructor(
    private commonService: CommonService,
    @Inject(forwardRef(() => DataSourceService))
    private dataSourceService: DataSourceService,
  ) {}

  async entityAutoGenerate(
    payload: CreateTableDto,
    staticRelations?: TStaticEntities,
  ) {
    this.logger.debug('--- Bắt đầu xử lý tableChangesHandler ---');

    try {
      this.logger.debug('Đang tải các Entities động hiện có...');
      const dynamicEntityDir = path.resolve(
        __dirname,
        '..',
        '..',
        'src',
        'dynamic-entities',
      );

      const repo =
        this.dataSourceService.getRepository<TableDefinition>(TableDefinition);

      let importPart = `import { Column, Entity, OneToMany, PrimaryGeneratedColumn, ManyToMany, ManyToOne, OneToOne, JoinTable, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';\n`;

      const imported = new Set<string>();
      if (payload.relations?.length) {
        for (const relation of payload.relations) {
          const targetTable = await repo.findOne({
            where: {
              id: relation.targetTable,
            },
          });

          if (!imported.has(targetTable.name)) {
            importPart += `import { ${this.commonService.capitalizeFirstLetterEachLine(targetTable.name)} } from './${targetTable.name.toLowerCase()}.entity';\n\n`;
            imported.add(targetTable.name);
          }
        }
      }

      // importPart += `import { TableDefinition } from './../entities/table.entity';\n`;
      // importPart += `import { HookDefinition } from './../entities/hook.entity';\n`;

      this.logger.debug(`Phần ImportPart được tạo:\n${importPart}`);

      let classPart = `@Entity("${payload.name.toLowerCase()}")\n`;
      if (payload.index && payload.index.length) {
        classPart += `@Index([`;
        for (const index of payload.index) {
          classPart += `"${index}", `;
        }
        classPart += `])\n`;
      }
      classPart += `export class ${this.commonService.capitalizeFirstLetterEachLine(payload.name)} {\n`;
      this.logger.debug(
        `Tên Class Entity: ${this.commonService.capitalizeFirstLetterEachLine(payload.name)}`,
      );

      for (const column of payload.columns) {
        this.logger.debug(
          `Đang xử lý cột: ${column.name} (Type: ${column.type}, Primary: ${column.isPrimary}, Nullable: ${column.isNullable})`,
        );
        if (column.isPrimary) {
          const strategy =
            column.type === 'int'
              ? `'increment'`
              : column.type === 'varchar'
                ? `"uuid"`
                : '';
          classPart += `  @PrimaryGeneratedColumn(${strategy})\n`;
        } else {
          classPart += `  @Column({`;
          classPart += `type:'${column.type}', nullable: ${String(column.isNullable)}`;
          if (column.default !== undefined) {
            let defVal = column.default;
            if (typeof defVal === 'string') {
              defVal = `"${defVal}"`;
            }
            classPart += `, default: ${defVal}`;
          }
          classPart += `})\n`;
          if (column.index) {
            classPart += `@Index()`;
          }
        }
        classPart += `  ${column.name}: ${this.commonService.dbTypeToTSType(column.type)};\n\n`; // Thêm 2 dấu cách và dòng trống
      }

      if (payload.relations && payload.relations.length > 0) {
        // Kiểm tra payload.relations tồn tại và có phần tử
        this.logger.debug(`Đang xử lý ${payload.relations.length} quan hệ.`);

        for (const relation of payload.relations) {
          const targetTable = await repo.findOne({
            where: {
              id: relation.targetTable,
            },
          });
          if (!targetTable) {
            throw new BadRequestException(
              `Bảng targetTable ID = ${relation.targetTable} không tồn tại!`,
            );
          }
          this.logger.debug(
            `  - Quan hệ: ${relation.propertyName} (${relation.type} to ${relation.targetTable})`,
          );
          const type =
            relation.type === 'many-to-many'
              ? `ManyToMany`
              : relation.type === 'one-to-one'
                ? `OneToOne`
                : relation.type === 'many-to-one'
                  ? `ManyToOne`
                  : `OneToMany`;
          if (
            relation.type !== 'many-to-many' &&
            relation.type !== 'one-to-one' &&
            relation.index
          ) {
            classPart += `@Index()\n`;
          }
          classPart += `  @${type}(() => ${this.commonService.capitalizeFirstLetterEachLine(targetTable.name)}, {`;
          if (relation.isEager) {
            classPart += ` eager: true,`;
          }
          if (relation.onDelete !== undefined) {
            classPart += ` onDelete: '${relation.onDelete}',`;
          }
          if (relation.onUpdate !== undefined) {
            classPart += ` onUpdate: '${relation.onUpdate}',`;
          }
          if (relation.isNullable !== undefined) {
            classPart += ` nullable: ${relation.isNullable}`;
          }
          classPart += `})\n`;

          if (relation.type === 'many-to-many') {
            classPart += `  @JoinTable()\n`;
          } else if (
            relation.type === 'many-to-one' ||
            relation.type === 'one-to-one'
          ) {
            classPart += `  @JoinColumn()\n`;
          }
          // Điều chỉnh kiểu dữ liệu cho quan hệ:
          // Nếu là OneToMany hoặc ManyToMany, nó sẽ là mảng.
          // Nếu là ManyToOne hoặc OneToOne, nó là một đối tượng duy nhất.
          const relationType =
            relation.type === 'one-to-many' || relation.type === 'many-to-many'
              ? '[]'
              : '';
          classPart += `  ${relation.propertyName}: ${this.commonService.capitalizeFirstLetterEachLine(targetTable.name)}${relationType};\n`;
        }
      } else {
        this.logger.debug('Không có quan hệ nào trong payload.');
      }
      classPart += `  @CreateDateColumn()\n`;
      classPart += `  createdAt: Date;\n\n`;
      classPart += `  @UpdateDateColumn()\n`;
      classPart += `  UpdatedAt: Date;\n`;
      // if (staticRelations !== undefined) {
      //   const type =
      //     staticRelations.type === 'many-to-many'
      //       ? `ManyToMany`
      //       : staticRelations.type === 'one-to-one'
      //         ? `OneToOne`
      //         : staticRelations.type === 'many-to-one'
      //           ? `ManyToOne`
      //           : `OneToMany`;

      //   classPart += `  @${type}(() => ${staticRelations.name === 'table' ? 'TableDefinition' : 'HookDefinition'})\n`;

      //   if (staticRelations.type === 'many-to-many')
      //     classPart += `  @JoinTable()\n`;
      //   if (staticRelations.type === 'many-to-one')
      //     classPart += `  @JoinColumn()\n`;
      //   classPart += `  targetTable: number`;
      // }
      classPart += `}`;
      this.logger.debug(`Phần ClassPart được tạo:\n${classPart}`);

      this.logger.debug('--- Bắt đầu xử lý ghi file ---');
      const dir = path.dirname(dynamicEntityDir);
      this.logger.debug(`Thư mục đích: ${dir}`);
      const entityFilePath = path.resolve(
        dynamicEntityDir,
        `${payload.name.toLowerCase()}.entity.ts`,
      );

      // Kiểm tra và xóa file cũ
      if (fs.existsSync(entityFilePath)) {
        this.logger.debug(`File đã tồn tại: ${entityFilePath}. Đang xóa...`);
        fs.unlinkSync(entityFilePath);
        this.logger.log('🧹 File cũ đã được xoá:', entityFilePath);
      } else {
        this.logger.debug(`File không tồn tại: ${entityFilePath}. Sẽ tạo mới.`);
      }

      // Kiểm tra và tạo thư mục
      if (!fs.existsSync(dir)) {
        this.logger.debug(`Thư mục không tồn tại: ${dir}. Đang tạo...`);
        fs.mkdirSync(dir, { recursive: true });
        this.logger.log('📁 Tạo thư mục:', dir);
      } else {
        this.logger.debug(`Thư mục đã tồn tại: ${dir}.`);
      }

      const fileContent = importPart + classPart;
      this.logger.debug(`Nội dung file Entity cuối cùng:\n${fileContent}`);
      fs.writeFileSync(entityFilePath, fileContent);
      this.logger.log('✅ Ghi file thành công:', dynamicEntityDir);

      this.logger.debug('--- Kết thúc xử lý tableChangesHandler ---');
      return { message: `Tạo bảng ${payload.name} thành công!` };
    } catch (error) {
      // Đảm bảo log toàn bộ thông tin lỗi
      this.logger.error('❌ Lỗi khi xử lý file:', error.message, error.stack);
      // Ném lại lỗi để NestJS có thể bắt và xử lý ở tầng cao hơn (ví dụ: Exception Filter)
      throw error;
    }
  }

  async autoBuildToJs() {
    const filePath = path.resolve(
      __dirname,
      '..',
      '..',
      'build-dynamic-entities.ts',
    );
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
    const migrationDir = path.resolve(
      __dirname,
      '..',
      '..',
      'src',
      'migrations',
      'AutoMigration',
    );
    const appDataSourceDir = path.resolve(
      __dirname,
      '..',
      '..',
      'src',
      'data-source',
      'data-source.ts',
    );

    const needDeleteDir = path.resolve(
      __dirname,
      '..',
      '..',
      'src',
      'migrations',
    );
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
    const dataSourceDir = path.resolve(
      __dirname,
      '..',
      '..',
      'src',
      'data-source',
      'data-source.ts',
    );
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

  async autoRemoveOldFile(filePathOrPaths: string | string[]) {
    try {
      const paths = Array.isArray(filePathOrPaths)
        ? filePathOrPaths
        : [filePathOrPaths];

      for (const filePath of paths) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          this.logger.log(`🧹 Đã xoá file: ${filePath}`);
        }
      }
    } catch (error) {
      this.logger.error(error.message);
      throw error;
    }
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

  async reGenerateEntitiesAfterUpdate(id: number) {
    const repo = this.dataSourceService.getRepository(TableDefinition);

    const tables = await repo
      .createQueryBuilder('table')
      .leftJoinAndSelect('table.relations', 'relation')
      .leftJoinAndMapOne(
        'relation.targetTable',
        'relation.targetTable',
        'target',
      )
      .leftJoinAndSelect('table.columns', 'column')
      .where('target.id = :id', { id })
      .getMany();

    // Lọc các bảng có quan hệ đến bảng targetTable.id = id
    const relatedTables: any = tables.filter((table: any) =>
      table.relations?.some((relation) => {
        return relation.targetTable?.id === id;
      }),
    );
    this.logger.log(`Có ${relatedTables.length} entity cần dc regenerate...`);

    for (let table of relatedTables) {
      table.relations = table.relations.map((rel: any) => ({
        ...rel,
        targetTable: rel.targetTable.id,
      }));

      console.dir(table.relations, { depth: null });
      this.logger.log(`Chuẩn bị generate ${table.name}...`);
      await this.entityAutoGenerate(table);
      await this.afterEffect();
      this.logger.debug(`Generate ${table.name} thành công!!!`);
    }
  }
}
