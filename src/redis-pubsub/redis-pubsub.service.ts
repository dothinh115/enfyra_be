import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { SchemaReloadService } from '../schema/schema-reload.service';
import { SCHEMA_UPDATED_EVENT_KEY } from '../utils/constant';

@Injectable()
export class RedisPubSubService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => SchemaReloadService))
    private schemaReloadService: SchemaReloadService,
  ) {}
  private pub: Redis;
  private sub: Redis;

  async onModuleInit() {
    this.pub = new Redis(this.configService.get<string>('REDIS_URI'));
    this.sub = new Redis(this.configService.get<string>('REDIS_URI'));

    await this.sub.subscribe(SCHEMA_UPDATED_EVENT_KEY);
    this.sub.on(
      'message',
      async (channel, message) =>
        await this.schemaReloadService.subscribe(message),
    );
  }

  async publish(channel: string, payload: any) {
    const message =
      typeof payload === 'string' ? payload : JSON.stringify(payload);
    await this.pub.publish(channel, message);
  }

  onModuleDestroy() {
    this.pub?.disconnect();
    this.sub?.disconnect();
  }
}
