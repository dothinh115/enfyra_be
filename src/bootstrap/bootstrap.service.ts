import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { AutoGenerateService } from '../auto-generate/auto-generate.service';
import { DataSourceService } from '../data-source/data-source.service';

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  constructor(
    private autoGService: AutoGenerateService,
    private dataSourceService: DataSourceService,
  ) {}

  async onApplicationBootstrap() {
    const dataSource = this.dataSourceService.getDataSource();
    const queryRunner = dataSource.createQueryRunner();
    const isUserTableExists = await queryRunner.hasTable('user');
    if (!isUserTableExists) {
      // await this.autoGService.afterEffect();
    }
  }

  //   async roleDefinition() {
  //     const queryRunner = this.dataSource.createQueryRunner();
  //     const hasTable = await queryRunner.hasTable('role');
  //     if (hasTable) {
  //       await queryRunner.release();
  //       return;
  //     }

  //     //Lưu thông tin bảng vào db

  //     const roleTableData = new TableDefinition();
  //     roleTableData.name = 'role';

  //     const idColumn = new ColumnDefinition();
  //     idColumn.name = 'id';
  //     idColumn.isPrimary = true;
  //     idColumn.table = roleTableData;
  //     idColumn.type = 'int';

  //     const nameColumn = new ColumnDefinition();
  //     nameColumn.name = 'name';
  //     nameColumn.table = roleTableData;
  //     nameColumn.type = 'varchar';

  //     roleTableData.columns = [idColumn, nameColumn];

  //     //logic tạo bảng thực trong db
  //     const roleTable = new Table({
  //       name: 'role',
  //       columns: [
  //         new TableColumn({
  //           name: idColumn.name,
  //           type: idColumn.type,
  //           isPrimary: idColumn.isPrimary,
  //           generationStrategy: 'increment',
  //         }),
  //         new TableColumn({
  //           name: nameColumn.name,
  //           type: nameColumn.type,
  //         }),
  //       ],
  //     });

  //     const promises = [
  //       this.tableDefinitionRepo.save(roleTableData),
  //       queryRunner.createTable(roleTable),
  //     ];

  //     await Promise.all(promises);
  //     console.log('Đã tạo bảng role');
  //   }

  //   async userDefination() {
  //     const queryRunner = this.dataSource.createQueryRunner();
  //     const hasTable = await queryRunner.hasTable('user');
  //     if (hasTable) {
  //       await queryRunner.release();
  //       return;
  //     }
  //     const userTableData = {
  //       name: 'user',
  //       columns: [
  //         {
  //           name: 'id',
  //           type: 'int',
  //           isPrimary: true,
  //           table: {
  //             name: 'user',
  //           },
  //         },
  //         {
  //           name: 'email',
  //           type: 'varchar',
  //           isNullable: false,
  //           table: {
  //             name: 'user',
  //           },
  //         },
  //         {
  //           name: 'email',
  //           type: 'varchar',
  //           isNullable: false,
  //           table: {
  //             name: 'user',
  //           },
  //         },
  //       ],
  //     };
  //   }
}
