// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { TableHandlerService } from '../table/table.service';
import { DataSourceService } from '../data-source/data-source.service';
import { CommonService } from '../common/common.service';
import { MetadataSyncService } from '../metadata/metadata-sync.service';
import { SchemaReloadService } from '../schema/schema-reload.service';
import { BadRequestException } from '@nestjs/common';
describe.skip('TableHandlerService', () => {
  let service: TableHandlerService;
  let dataSourceService: jest.Mocked<DataSourceService>;
  let commonService: jest.Mocked<CommonService>;
  let metadataSyncService: jest.Mocked<MetadataSyncService>;
  let schemaReloadService: jest.Mocked<SchemaReloadService>;

  const mockTable = {
    id: '1',
    name: 'test_table',
    displayName: 'Test Table',
    isEnabled: true,
    columns: [],
    relations: []
  };

  beforeEach(async () => {
    const mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(),
      dropTable: jest.fn(),
      hasTable: jest.fn(),
      createTable: jest.fn(),
    };

    const mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
      manager: {
        query: jest.fn(),
      }
    };

    const mockRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockReturnValue({}),
    } as any;

    const mockDataSourceService = {
      getRepository: jest.fn().mockReturnValue(mockRepo),
      getDataSource: jest.fn().mockReturnValue(mockDataSource),
    };

    const mockCommonService = {
      delay: jest.fn(),
    };

    const mockMetadataSyncService = {
      syncAll: jest.fn(),
    };

    const mockSchemaReloadService = {
      lockSchema: jest.fn(),
      unlockSchema: jest.fn(),
      publishSchemaUpdated: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TableHandlerService,
        { provide: DataSourceService, useValue: mockDataSourceService },
        { provide: CommonService, useValue: mockCommonService },
        { provide: MetadataSyncService, useValue: mockMetadataSyncService },
        { provide: SchemaReloadService, useValue: mockSchemaReloadService },
      ],
    }).compile();

    service = module.get<TableHandlerService>(TableHandlerService);
    dataSourceService = module.get(DataSourceService);
    commonService = module.get(CommonService);
    metadataSyncService = module.get(MetadataSyncService);
    schemaReloadService = module.get(SchemaReloadService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('find', () => {
    it('should return all tables', async () => {
      const mockRepo = dataSourceService.getRepository('table_definition');
      mockRepo.find.mockResolvedValue([mockTable]);

      const result = await service.find();

      expect(result).toEqual([mockTable]);
      expect(mockRepo.find).toHaveBeenCalledWith({
        relations: ['columns', 'relations']
      });
    });

    it('should handle empty table list', async () => {
      const mockRepo = dataSourceService.getRepository('table_definition');
      mockRepo.find.mockResolvedValue([]);

      const result = await service.find();

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    const createTableDto = {
      name: 'new_table',
      displayName: 'New Table',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          isPrimary: true,
          isNullable: false
        }
      ]
    };

    it('should create table successfully', async () => {
      commonService.validateIdentifier.mockReturnValue(true);
      const mockRepo = dataSourceService.getRepository('table_definition');
      mockRepo.findOne.mockResolvedValue(null); // Table doesn't exist
      mockRepo.create.mockReturnValue(mockTable);
      mockRepo.save.mockResolvedValue(mockTable);
      autoService.syncAll.mockResolvedValue(undefined);

      const result = await service.create(createTableDto);

      expect(result).toEqual(mockTable);
      expect(autoService.syncAll).toHaveBeenCalled();
    });

    it('should throw error for invalid table name', async () => {
      commonService.validateIdentifier.mockReturnValue(false);

      await expect(service.create({ ...createTableDto, name: 'invalid-name' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw error for existing table name', async () => {
      commonService.validateIdentifier.mockReturnValue(true);
      const mockRepo = dataSourceService.getRepository('table_definition');
      mockRepo.findOne.mockResolvedValue(mockTable);

      await expect(service.create(createTableDto))
        .rejects.toThrow(BadRequestException);
    });

    it('should validate column names', async () => {
      const invalidDto = {
        ...createTableDto,
        columns: [{ name: 'invalid-column', type: 'string' }]
      };

      commonService.validateIdentifier
        .mockReturnValueOnce(true) // table name valid
        .mockReturnValueOnce(false); // column name invalid

      await expect(service.create(invalidDto))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    const updateDto = {
      displayName: 'Updated Table',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          isPrimary: true
        }
      ]
    };

    it('should update table successfully', async () => {
      const mockRepo = dataSourceService.getRepository('table_definition');
      mockRepo.findOne.mockResolvedValue(mockTable);
      mockRepo.save.mockResolvedValue({ ...mockTable, ...updateDto });
      autoService.syncAll.mockResolvedValue(undefined);

      const result = await service.update('1', updateDto);

      expect(result).toEqual(expect.objectContaining(updateDto));
      expect(autoService.syncAll).toHaveBeenCalled();
    });

    it('should throw error for non-existent table', async () => {
      const mockRepo = dataSourceService.getRepository('table_definition');
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.update('999', updateDto))
        .rejects.toThrow(BadRequestException);
    });

    it('should validate new column names in update', async () => {
      const invalidUpdateDto = {
        ...updateDto,
        columns: [{ name: 'invalid-column', type: 'string' }]
      };

      commonService.validateIdentifier.mockReturnValue(false);
      const mockRepo = dataSourceService.getRepository('table_definition');
      mockRepo.findOne.mockResolvedValue(mockTable);

      await expect(service.update('1', invalidUpdateDto))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('should delete table and drop from database', async () => {
      const mockRepo = dataSourceService.getRepository('table_definition');
      const mockQueryRunner = dataSourceService.getDataSource().createQueryRunner();
      
      mockRepo.findOne.mockResolvedValue(mockTable);
      mockQueryRunner.query.mockResolvedValue([]);
      mockQueryRunner.hasTable.mockResolvedValue(true);
      mockRepo.delete.mockResolvedValue({ affected: 1 });

      await service.delete('1');

      expect(mockQueryRunner.dropTable).toHaveBeenCalledWith('test_table');
      expect(mockRepo.delete).toHaveBeenCalledWith('1');
      expect(autoService.syncAll).toHaveBeenCalled();
    });

    it('should clean up foreign keys before dropping table', async () => {
      const mockRepo = dataSourceService.getRepository('table_definition');
      const mockQueryRunner = dataSourceService.getDataSource().createQueryRunner();
      
      mockRepo.findOne.mockResolvedValue(mockTable);
      mockQueryRunner.query.mockResolvedValue([
        { CONSTRAINT_NAME: 'FK_test_constraint' }
      ]);
      mockQueryRunner.hasTable.mockResolvedValue(true);

      await service.delete('1');

      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('ALTER TABLE `test_table` DROP FOREIGN KEY')
      );
    });

    it('should throw error for non-existent table', async () => {
      const mockRepo = dataSourceService.getRepository('table_definition');
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.delete('999'))
        .rejects.toThrow(BadRequestException);
    });

    it('should handle table that does not exist in database', async () => {
      const mockRepo = dataSourceService.getRepository('table_definition');
      const mockQueryRunner = dataSourceService.getDataSource().createQueryRunner();
      
      mockRepo.findOne.mockResolvedValue(mockTable);
      mockQueryRunner.hasTable.mockResolvedValue(false);
      mockRepo.delete.mockResolvedValue({ affected: 1 });

      await service.delete('1');

      expect(mockQueryRunner.dropTable).not.toHaveBeenCalled();
      expect(mockRepo.delete).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database transaction errors', async () => {
      const mockRepo = dataSourceService.getRepository('table_definition');
      const mockQueryRunner = dataSourceService.getDataSource().createQueryRunner();
      
      mockRepo.findOne.mockResolvedValue(mockTable);
      mockQueryRunner.dropTable.mockRejectedValue(new Error('Database error'));

      await expect(service.delete('1')).rejects.toThrow('Database error');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should handle sync errors gracefully', async () => {
      commonService.validateIdentifier.mockReturnValue(true);
      const mockRepo = dataSourceService.getRepository('table_definition');
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockReturnValue(mockTable);
      mockRepo.save.mockResolvedValue(mockTable);
      autoService.syncAll.mockRejectedValue(new Error('Sync failed'));

      // Should still create table even if sync fails
      const result = await service.create({
        name: 'test_table',
        displayName: 'Test',
        columns: []
      });

      expect(result).toEqual(mockTable);
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple table operations concurrently', async () => {
      const mockRepo = dataSourceService.getRepository('table_definition');
      mockRepo.find.mockResolvedValue([mockTable]);

      const promises = Array.from({ length: 10 }, () => service.find());
      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(results.every(r => r.length === 1)).toBe(true);
    });
  });

  describe('Validation Tests', () => {
    it('should validate required fields', async () => {
      await expect(service.create({
        name: '',
        displayName: 'Test',
        columns: []
      })).rejects.toThrow();
    });

    it('should validate column types', async () => {
      const invalidDto = {
        name: 'test_table',
        displayName: 'Test',
        columns: [
          { name: 'col1', type: 'invalid_type' }
        ]
      };

      commonService.validateIdentifier.mockReturnValue(true);

      await expect(service.create(invalidDto))
        .rejects.toThrow(BadRequestException);
    });
  });
});