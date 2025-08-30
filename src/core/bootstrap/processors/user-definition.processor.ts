import { Injectable } from '@nestjs/common';
import { BaseTableProcessor } from './base-table-processor';
import { BcryptService } from '../../auth/services/bcrypt.service';

@Injectable()
export class UserDefinitionProcessor extends BaseTableProcessor {
  constructor(private readonly bcryptService: BcryptService) {
    super();
  }

  async transformRecords(records: any[]): Promise<any[]> {
    // Hash passwords before upsert
    return Promise.all(
      records.map(async record => {
        // Type guard cho password - cần thiết cho security
        if (this.isValidPassword(record.password)) {
          try {
            return {
              ...record,
              password: await this.bcryptService.hash(record.password),
            };
          } catch (hashError) {
            this.logger.warn(
              `⚠️ Failed to hash password for user ${record.username}: ${hashError instanceof Error ? hashError.message : String(hashError)}`
            );
          }
        }
        return record;
      })
    );
  }

  private isValidPassword(password: any): boolean {
    return typeof password === 'string' && password.length > 0;
  }

  getUniqueIdentifier(record: any): object {
    return { username: record.username };
  }

  protected getCompareFields(): string[] {
    return ['email', 'isRootAdmin', 'isSystem'];
  }
}
