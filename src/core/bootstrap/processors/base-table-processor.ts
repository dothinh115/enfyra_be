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
    try {
      return records;
    } catch (transformError) {
      this.logger.error(
        `❌ Error transforming records: ${transformError instanceof Error ? transformError.message : String(transformError)}`
      );
      // Return original records if transformation fails
      return records;
    }
  }

  /**
   * Get unique identifier to find existing record (must implement)
   */
  abstract getUniqueIdentifier(record: any): object | object[];

  /**
   * Get human-readable identifier for logging (can be overridden)
   */
  protected getRecordIdentifier(record: any): string {
    try {
      // Default implementation - can be overridden in subclasses
      if (record.name) return record.name;
      if (record.label) return record.label;
      if (record.path) return record.path;
      if (record.type && record.label) return `${record.type}: ${record.label}`;
      if (record.email) return record.email;
      if (record.method) return record.method;

      // Safe fallback for complex objects
      try {
        return JSON.stringify(record).substring(0, 50) + '...';
      } catch (jsonError) {
        return `Record[${record.id || 'unknown'}]`;
      }
    } catch (error) {
      return `Record[${record.id || 'unknown'}]`;
    }
  }

  /**
   * Process upsert for all records
   */
  async process(
    records: any[],
    repo: Repository<any>,
    context?: any
  ): Promise<UpsertResult> {
    try {
      if (!records || records.length === 0) {
        return { created: 0, skipped: 0 };
      }

      // Transform records if needed
      const transformedRecords = await this.transformRecords(records, context);

      let createdCount = 0;
      let skippedCount = 0;

      // Batch process records for better performance
      const batchSize = 50; // Process in batches to avoid memory issues

      for (let i = 0; i < transformedRecords.length; i += batchSize) {
        const batch = transformedRecords.slice(i, i + batchSize);

        // Process batch in parallel for better performance
        const batchResults = await Promise.all(
          batch.map(async record => {
            try {
              const uniqueWhere = this.getUniqueIdentifier(record);
              const whereConditions = Array.isArray(uniqueWhere)
                ? uniqueWhere
                : [uniqueWhere];

              // Try to find existing record
              let existingRecord = null;
              for (const whereCondition of whereConditions) {
                // Remove many-to-many fields from where condition to avoid query errors
                const cleanedCondition = { ...whereCondition };
                for (const key in cleanedCondition) {
                  if (
                    Array.isArray(cleanedCondition[key]) &&
                    cleanedCondition[key].length > 0 &&
                    typeof cleanedCondition[key][0] === 'object'
                  ) {
                    // This looks like a many-to-many relation, remove it
                    delete cleanedCondition[key];
                  }
                }

                // Skip empty conditions to avoid invalid queries
                if (Object.keys(cleanedCondition).length === 0) {
                  continue;
                }

                // Additional validation for ID fields
                for (const key in cleanedCondition) {
                  if (
                    key.toLowerCase().endsWith('id') ||
                    key.toLowerCase() === 'id'
                  ) {
                    const value = cleanedCondition[key];
                    if (
                      typeof value === 'string' &&
                      [
                        'GET',
                        'POST',
                        'PUT',
                        'DELETE',
                        'PATCH',
                        'OPTIONS',
                        'HEAD',
                      ].includes(value)
                    ) {
                      this.logger.warn(
                        `⚠️ Skipping invalid ID value: ${key} = ${value}`
                      );
                      delete cleanedCondition[key];
                    }
                  }
                }

                // Skip if no valid conditions left
                if (Object.keys(cleanedCondition).length === 0) {
                  continue;
                }

                try {
                  existingRecord = await repo.findOne({
                    where: cleanedCondition,
                  });
                  if (existingRecord) break;
                } catch (queryError) {
                  this.logger.debug(
                    `Query failed for condition ${JSON.stringify(cleanedCondition)}: ${queryError instanceof Error ? queryError.message : String(queryError)}`
                  );
                  continue;
                }
              }

              if (existingRecord) {
                const hasChanges = this.detectRecordChanges(
                  record,
                  existingRecord
                );
                if (hasChanges) {
                  await this.updateRecord(existingRecord.id, record, repo);
                  return {
                    action: 'updated',
                    identifier: this.getRecordIdentifier(record),
                  };
                } else {
                  return {
                    action: 'skipped',
                    identifier: this.getRecordIdentifier(record),
                  };
                }
              } else {
                // Create new record
                const created = repo.create(record);
                await repo.save(created);
                return {
                  action: 'created',
                  identifier: this.getRecordIdentifier(record),
                };
              }
            } catch (error) {
              this.logger.error(
                `❌ Error processing record: ${error instanceof Error ? error.message : String(error)}`
              );
              this.logger.debug(`Record: ${JSON.stringify(record)}`);
              return {
                action: 'error',
                identifier: this.getRecordIdentifier(record),
              };
            }
          })
        );

        // Process batch results
        for (const result of batchResults) {
          if (result.action === 'created') {
            createdCount++;
            this.logger.log(`   ✅ Created: ${result.identifier}`);
          } else if (result.action === 'updated') {
            skippedCount++; // Count as skipped since not created new
            this.logger.log(`   🔄 Updated: ${result.identifier}`);
          } else if (result.action === 'skipped') {
            skippedCount++;
            this.logger.log(`   ⏩ Skipped (no changes): ${result.identifier}`);
          }
          // Error results are already logged above
        }
      }

      return { created: createdCount, skipped: skippedCount };
    } catch (processError) {
      this.logger.error(
        `❌ Error in process method: ${processError instanceof Error ? processError.message : String(processError)}`
      );
      // Return safe default result
      return { created: 0, skipped: 0 };
    }
  }

  protected detectRecordChanges(newRecord: any, existingRecord: any): boolean {
    try {
      const compareFields = this.getCompareFields();
      for (const field of compareFields) {
        if (this.hasValueChanged(newRecord[field], existingRecord[field])) {
          return true;
        }
      }
      return false;
    } catch (compareError) {
      this.logger.warn(
        `⚠️ Error comparing records: ${compareError instanceof Error ? compareError.message : String(compareError)}`
      );
      // If comparison fails, assume there are changes to be safe
      return true;
    }
  }

  protected getCompareFields(): string[] {
    try {
      return ['name', 'description']; // Default fields
    } catch (error) {
      this.logger.warn(
        `⚠️ Error getting compare fields: ${error instanceof Error ? error.message : String(error)}`
      );
      // Return safe default fields
      return ['name', 'description'];
    }
  }

  protected hasValueChanged(newValue: any, existingValue: any): boolean {
    // Type guard cho primitive values - cần thiết cho performance
    if (this.isPrimitive(newValue) && this.isPrimitive(existingValue)) {
      return newValue !== existingValue;
    }

    // Type guard cho null/undefined - cần thiết cho safety
    if (newValue === null && existingValue === null) return false;
    if (newValue === undefined && existingValue === undefined) return false;
    if (newValue === null || existingValue === null) return true;
    if (newValue === undefined || existingValue === undefined) return true;

    // Type guard cho objects - chỉ khi cần thiết
    if (this.isObject(newValue) && this.isObject(existingValue)) {
      try {
        return JSON.stringify(newValue) !== JSON.stringify(existingValue);
      } catch {
        // Fallback cho circular references
        return this.shallowCompare(newValue, existingValue);
      }
    }

    return newValue !== existingValue;
  }

  private isPrimitive(value: any): boolean {
    return value === null || value === undefined || typeof value !== 'object';
  }

  private isObject(value: any): boolean {
    return value !== null && value !== undefined && typeof value === 'object';
  }

  private shallowCompare(obj1: any, obj2: any): boolean {
    const keys1 = Object.keys(obj1 || {});
    const keys2 = Object.keys(obj2 || {});

    if (keys1.length !== keys2.length) return true;

    for (const key of keys1) {
      if (obj1[key] !== obj2[key]) return true;
    }

    return false;
  }

  protected async updateRecord(
    existingId: any,
    record: any,
    repo: Repository<any>
  ): Promise<void> {
    try {
      // Separate many-to-many fields from regular fields
      const regularFields: any = {};
      const manyToManyFields: any = {};

      for (const key in record) {
        if (
          Array.isArray(record[key]) &&
          record[key].length > 0 &&
          typeof record[key][0] === 'object'
        ) {
          // This looks like a many-to-many relation
          manyToManyFields[key] = record[key];
        } else {
          regularFields[key] = record[key];
        }
      }

      // Update regular fields first
      if (Object.keys(regularFields).length > 0) {
        await repo.update(existingId, regularFields);
      }

      // Then handle many-to-many relations using save
      if (Object.keys(manyToManyFields).length > 0) {
        await repo.save({
          id: existingId,
          ...manyToManyFields,
        });
      }
    } catch (updateError) {
      this.logger.error(
        `❌ Error updating record ${existingId}: ${updateError instanceof Error ? updateError.message : String(updateError)}`
      );
      throw updateError; // Re-throw to be handled by caller
    }
  }
}
