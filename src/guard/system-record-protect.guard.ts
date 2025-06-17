import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { EntityMetadata } from 'typeorm';
import { DataSourceService } from '../data-source/data-source.service';

@Injectable()
export class SystemRecordProtectGuard implements CanActivate {
  constructor(private readonly dataSourceService: DataSourceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req: any = context.switchToHttp().getRequest<Request>();
    const method = req.method;

    if (!['PATCH', 'DELETE'].includes(method)) {
      return true;
    }

    const routeData: any = req.routeData;
    const mainTableName = routeData?.mainTable?.name;
    const id = routeData?.params?.id;

    if (!mainTableName || !id) {
      return true;
    }

    const repo = this.dataSourceService.getRepository(mainTableName);

    if (method === 'DELETE') {
      const record: any = await repo.findOne({
        where: { id },
      });

      if (record?.isSystem) {
        throw new ForbiddenException(
          `Không thể xoá bản ghi hệ thống (id: ${id}).`,
        );
      }
    }

    if (!req.body || typeof req.body !== 'object') {
      return true;
    }

    const dataSource = this.dataSourceService.getDataSource();
    const meta: EntityMetadata = dataSource.entityMetadatas.find(
      (m) => m.tableName === mainTableName,
    );

    if (!meta) {
      return true;
    }

    const relations = meta.relations;

    for (const [key, value] of Object.entries(req.body)) {
      const rel = relations.find((r) => r.propertyName === key);
      if (!rel) {
        continue;
      }
      if (!rel.inverseEntityMetadata?.tableName) {
        continue;
      }

      const relRepo = this.dataSourceService.getRepository(
        rel.inverseEntityMetadata.tableName,
      );

      if (method === 'PATCH') {
        const current = await repo
          .createQueryBuilder('entity')
          .leftJoinAndSelect(`entity.${key}`, 'rel')
          .where('entity.id = :id', { id })
          .select(['entity.id', 'rel.id'])
          .getOne();

        const currentValue = (current as any)?.[key];
        const currentIds: string[] = Array.isArray(currentValue)
          ? currentValue.map((v: any) => v?.id)
          : currentValue?.id
            ? [currentValue.id]
            : [];

        const incomingIds: string[] = (() => {
          if (Array.isArray(value)) {
            return value
              .map((v) =>
                typeof v === 'object' && v?.id
                  ? v.id
                  : typeof v === 'string' || typeof v === 'number'
                    ? v
                    : null,
              )
              .filter(Boolean);
          }

          if (typeof value === 'object' && (value as any)?.id) {
            return [(value as any).id];
          }

          if (typeof value === 'string' || typeof value === 'number') {
            return [value];
          }

          return [];
        })();

        const isSame =
          incomingIds.length === currentIds.length &&
          incomingIds.every((id) => currentIds.includes(id));

        if (isSame) {
          continue;
        }

        for (const incomingId of incomingIds) {
          if (currentIds.includes(incomingId)) continue; // ✅ đã có sẵn, không phải "cập nhật"

          const relRecord: any = await relRepo.findOne({
            where: { id: incomingId },
          });

          if (relRecord?.isSystem) {
            throw new ForbiddenException(
              `Không thể cập nhật quan hệ ${key} đến bản ghi hệ thống (id: ${incomingId}).`,
            );
          }
        }

        for (const currentId of currentIds) {
          if (!incomingIds.includes(currentId)) {
            const relRecord: any = await relRepo.findOne({
              where: { id: currentId },
            });

            if (!relRecord) {
              continue;
            }

            if (relRecord.isSystem === true) {
              throw new ForbiddenException(
                `Không thể xoá quan hệ ${key} đang trỏ đến bản ghi hệ thống (id: ${currentId}).`,
              );
            }
          }
        }
      }

      if (method === 'DELETE' && Array.isArray(value)) {
        for (const item of value) {
          if (!item?.id) continue;

          const relRecord: any = await relRepo.findOne({
            where: { id: item.id },
          });

          if (relRecord?.isSystem) {
            throw new ForbiddenException(
              `Không thể xoá bản ghi liên kết hệ thống (${key} → ${item.id}).`,
            );
          }
        }
      }
    }

    return true;
  }
}
