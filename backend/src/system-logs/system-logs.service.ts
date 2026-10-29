import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemLog } from './system-log.entity';

@Injectable()
export class SystemLogsService {
  constructor(
    @InjectRepository(SystemLog)
    private readonly repo: Repository<SystemLog>,
  ) {}

  async log(params: {
    actorUserId?: number | null;
    action: string;
    entityType?: string;
    entityId?: string | number;
    result?: string;
    metadata?: Record<string, unknown>;
  }) {
    const safeMeta = params.metadata
      ? JSON.stringify(this.sanitize(params.metadata))
      : null;
    const entry = this.repo.create({
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId != null ? String(params.entityId) : null,
      result: params.result ?? 'SUCCESS',
      metadata: safeMeta,
    });
    return this.repo.save(entry);
  }

  private sanitize(meta: Record<string, unknown>) {
    const clone = { ...meta };
    delete clone.password;
    delete clone.passwordHash;
    delete clone.token;
    delete clone.access_token;
    return clone;
  }

  async findAll(limit = 100) {
    return this.repo.find({
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 500),
    });
  }
}
