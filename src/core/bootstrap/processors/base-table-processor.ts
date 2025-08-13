import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';

export interface UpsertResult {
  created: number;
  skipped: number;
}

export abstract class BaseTableProcessor {
  protected readonly logger = new Logger(this.constructor.name);

  /**
   * Transform raw records before upsert (override if needed)
   */
  async transformRecords(records: any[], context?: any): Promise<any[]> {
    return records;
  }

  /**
   * Get unique identifier to find existing record (must implement)
   */
  abstract getUniqueIdentifier(record: any): object | object[];

  /**
   * Process upsert for all records
   */
  async process(records: any[], repo: Repository<any>, context?: any): Promise<UpsertResult> {
    if (!records || records.length === 0) {
      return { created: 0, skipped: 0 };
    }

    // Transform records if needed
    const transformedRecords = await this.transformRecords(records, context);
    
    let createdCount = 0;
    let skippedCount = 0;

    for (const record of transformedRecords) {
      try {
        const uniqueWhere = this.getUniqueIdentifier(record);
        const whereConditions = Array.isArray(uniqueWhere) ? uniqueWhere : [uniqueWhere];

        // Try to find existing record
        let existingRecord = null;
        for (const whereCondition of whereConditions) {
          existingRecord = await repo.findOne({ where: whereCondition });
          if (existingRecord) break;
        }

        if (existingRecord) {
          // TODO: Temporarily commented - Update logic will be restored later
          // const hasChanges = this.detectRecordChanges(record, existingRecord);
          // if (hasChanges) {
          //   await this.updateRecord(existingRecord.id, record, repo);
          //   updatedCount++;
          //   this.logger.debug(`🔄 Updated: ${JSON.stringify(record).substring(0, 50)}...`);
          // } else {
          //   this.logger.debug(`⏩ No changes: ${JSON.stringify(record).substring(0, 50)}...`);
          // }

          skippedCount++;
          this.logger.debug(`⏩ Skipped (exists): ${JSON.stringify(record).substring(0, 50)}...`);
        } else {
          // Create new record
          const created = repo.create(record);
          await repo.save(created);
          createdCount++;
          this.logger.debug(`✅ Created: ${JSON.stringify(record).substring(0, 50)}...`);
        }
      } catch (error) {
        this.logger.error(`❌ Error processing record: ${error.message}`);
        this.logger.debug(`Record: ${JSON.stringify(record)}`);
      }
    }

    return { created: createdCount, skipped: skippedCount };
  }

  // TODO: These will be used when update logic is uncommented
  // protected detectRecordChanges(newRecord: any, existingRecord: any): boolean {
  //   const compareFields = this.getCompareFields();
  //   for (const field of compareFields) {
  //     if (this.hasValueChanged(newRecord[field], existingRecord[field])) {
  //       return true;
  //     }
  //   }
  //   return false;
  // }

  // protected getCompareFields(): string[] {
  //   return ['name', 'description']; // Default fields
  // }

  // protected hasValueChanged(newValue: any, existingValue: any): boolean {
  //   if (newValue === null && existingValue === null) return false;
  //   if (newValue === undefined && existingValue === undefined) return false;
  //   if (newValue === null || existingValue === null) return true;
  //   if (newValue === undefined || existingValue === undefined) return true;
  //   
  //   if (typeof newValue === 'object' && typeof existingValue === 'object') {
  //     return JSON.stringify(newValue) !== JSON.stringify(existingValue);
  //   }
  //   
  //   return newValue !== existingValue;
  // }

  // protected async updateRecord(existingId: any, record: any, repo: Repository<any>): Promise<void> {
  //   await repo.update(existingId, record);
  // }
}