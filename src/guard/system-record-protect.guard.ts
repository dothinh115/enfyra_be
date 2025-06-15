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

    console.log('🧪 [Guard] method =', method);

    if (!['PATCH', 'DELETE'].includes(method)) {
      console.log('🛑 [Guard] method không phải PATCH/DELETE → bỏ qua');
      return true;
    }

    const routeData: any = req.routeData;
    const mainTableName = routeData?.mainTable?.name;
    const id = routeData?.params?.id;

    console.log('🧪 [Guard] routeData =', { mainTableName, id });

    if (!mainTableName || !id) {
      console.log('🛑 [Guard] Thiếu mainTableName hoặc id → bỏ qua');
      return true;
    }

    const repo = this.dataSourceService.getRepository(mainTableName);

    if (method === 'DELETE') {
      console.log('🧨 [Guard] Kiểm tra DELETE bản ghi chính...');
      const record: any = await repo.findOne({
        where: { id },
        select: ['id', 'isSystem'],
      });

      console.log('🧨 [Guard] Bản ghi hiện tại =', record);

      if (record?.isSystem) {
        throw new ForbiddenException(
          `Không thể xoá bản ghi hệ thống (id: ${id}).`,
        );
      }
    }

    if (!req.body || typeof req.body !== 'object') {
      console.log('🛑 [Guard] Không có body hoặc body không hợp lệ → bỏ qua');
      return true;
    }

    const dataSource = this.dataSourceService.getDataSource();
    const meta: EntityMetadata = dataSource.entityMetadatas.find(
      (m) => m.tableName === mainTableName,
    );

    if (!meta) {
      console.log('🛑 [Guard] Không tìm thấy metadata → bỏ qua');
      return true;
    }

    const relations = meta.relations;
    console.log(
      '🧩 [Guard] relations:',
      relations.map((r) => r.propertyName),
    );

    for (const [key, value] of Object.entries(req.body)) {
      console.log(`🔍 [Guard] Đang xử lý key: "${key}"`);

      const rel = relations.find((r) => r.propertyName === key);

      if (!rel) {
        console.log(`ℹ️ [Guard] "${key}" không phải quan hệ → bỏ qua`);
        continue;
      }

      if (!rel.inverseEntityMetadata?.tableName) {
        console.log(`ℹ️ [Guard] "${key}" không có bảng ngược → bỏ qua`);
        continue;
      }

      const relRepo = this.dataSourceService.getRepository(
        rel.inverseEntityMetadata.tableName,
      );

      if (method === 'PATCH') {
        console.log(`🛠️ [Guard] PATCH kiểm tra thay đổi quan hệ: ${key}`);

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

        console.log('🧪 [Guard] Quan hệ:', { key, currentIds, incomingIds });

        const isSame =
          incomingIds.length === currentIds.length &&
          incomingIds.every((id) => currentIds.includes(id));

        if (isSame) {
          console.log(`✅ [Guard] Quan hệ "${key}" không thay đổi`);
          continue;
        }

        for (const incomingId of incomingIds) {
          if (currentIds.includes(incomingId)) continue; // ✅ đã có sẵn, không phải "cập nhật"

          const relRecord: any = await relRepo.findOne({
            where: { id: incomingId },
            select: ['id', 'isSystem'],
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
              select: ['id', 'isSystem'],
            });

            console.log(
              '⬅️ [Guard] currentId:',
              currentId,
              'record:',
              relRecord,
            );

            if (!relRecord) {
              console.log(`⚠️ Bỏ qua currentId ${currentId} vì không tìm thấy`);
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
            select: ['id', 'isSystem'],
          });

          console.log('🗑️ [Guard] DELETE item:', item.id, 'record:', relRecord);

          if (relRecord?.isSystem) {
            throw new ForbiddenException(
              `Không thể xoá bản ghi liên kết hệ thống (${key} → ${item.id}).`,
            );
          }
        }
      }
    }

    console.log('✅ [Guard] Không có vấn đề gì → tiếp tục');
    return true;
  }
}
