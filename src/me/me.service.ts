import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { User_definition } from '../entities/user_definition.entity';
import { DataSourceService } from '../data-source/data-source.service';

@Injectable()
export class MeService {
  constructor(private dsService: DataSourceService) {}

  async find(req: Request & { user: User_definition }) {
    if (!req.user) throw new UnauthorizedException();
    return req.user;
  }

  async update(body: any, req: Request & { user: User_definition }) {
    if (!req.user) throw new UnauthorizedException();
    const repo = this.dsService.getRepository('user_definition');
    return await repo.update(req.user.id, body);
  }
}
