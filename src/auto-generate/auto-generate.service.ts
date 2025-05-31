import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { DataSourceService } from '../data-source/data-source.service';
import { CreateTableDto } from '../table/dto/create-table.dto';
import { CommonService } from '../common/common.service';

@Injectable()
export class AutoGenerateService {
  private readonly logger = new Logger(AutoGenerateService.name);

  constructor(
    private commonService: CommonService,
    @Inject(forwardRef(() => DataSourceService))
    private dataSourceService: DataSourceService,
  ) {}

  async entityAutoGenerate(payload: CreateTableDto) {
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
      this.logger.debug(`Đường dẫn file Entity dự kiến: ${dynamicEntityDir}`);
      const entityDir = path.resolve(__dirname, '..', 'dynamic-entities');

      const entities = await this.commonService.loadDynamicEntities(entityDir);
      this.logger.debug(`Đã tải ${entities.length} Entities.`);

      const entityNames = entities
        .map((entity) => entity)
        .filter(
          (entity) => entity.name.toLowerCase() !== payload.name.toLowerCase(),
        ); // Chuyển cả payload.name về lowerCase để so sánh chính xác hơn
      this.logger.debug(
        `Các Entity khác cần import: ${entityNames.join(', ')}`,
      );

      let importPart = `import { Column, Entity, OneToMany, PrimaryGeneratedColumn, ManyToMany, ManyToOne, OneToOne, JoinTable, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';\n`;
      for (const entityName of entityNames) {
        importPart += `import { ${entityName.name} } from './${entityName.name.toLowerCase()}.entity';\n\n`;
      }
      this.logger.debug(`Phần ImportPart được tạo:\n${importPart}`);

      let classPart = `@Entity()\n`;
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
          classPart += `type:'${column.type}', nullable: ${column.isNullable}`;
          if (column.default !== undefined) {
            const type =
              column.type === 'int' || column.type === 'float'
                ? column.type
                : column.type === 'varchar' || column.type === 'text'
                  ? `"${column.default}"`
                  : column.default;
            classPart += `, default: ${type}`;
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
          classPart += `  @${type}(() => ${this.commonService.capitalizeFirstLetterEachLine(relation.targetTable)}, {`;
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
          classPart += `  ${relation.propertyName}: ${this.commonService.capitalizeFirstLetterEachLine(relation.targetTable)}${relationType};\n`;
        }
      } else {
        this.logger.debug('Không có quan hệ nào trong payload.');
      }
      classPart += `  @CreateDateColumn()\n`;
      classPart += `  createdAt: Date;\n\n`;
      classPart += `  @UpdateDateColumn()\n`;
      classPart += `  UpdatedAt: Date;\n`;
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
      await this.afterEffect();
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
      await this.dataSourceService.reloadDataSource();
      await this.autoGenerateMigrationFile();
      await this.autoRunMigration();
    } catch (error) {
      this.logger.error('Lỗi trong afterEffect:', error);
      throw error;
    }
  }
}
