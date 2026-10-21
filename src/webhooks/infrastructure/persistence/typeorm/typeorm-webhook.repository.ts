import { Injectable } from '@nestjs/common';
import { In, IsNull } from 'typeorm';
import { TypeOrmUnitOfWork } from '../../../../shared/database/unit-of-work';
import { WebhookEndpoint } from '../../../domain/entities/webhook-endpoint.entity';
import { WebhookEvent } from '../../../domain/entities/event.entity';
import {
  DueDelivery,
  WebhookRepository,
} from '../../../domain/ports/webhook.repository';
import { EventRecord, WebhookEndpointRecord } from './webhook.records';

@Injectable()
export class TypeOrmWebhookRepository implements WebhookRepository {
  constructor(private readonly uow: TypeOrmUnitOfWork) {}

  async saveEndpoint(endpoint: WebhookEndpoint): Promise<void> {
    await this.uow.manager().insert(WebhookEndpointRecord, {
      id: endpoint.id,
      merchantId: endpoint.merchantId,
      url: endpoint.url,
      secret: endpoint.secret,
      createdAt: endpoint.createdAt,
      disabledAt: endpoint.disabledAt,
    });
  }

  async saveDisabled(endpoint: WebhookEndpoint): Promise<void> {
    await this.uow
      .manager()
      .update(
        WebhookEndpointRecord,
        { id: endpoint.id, disabledAt: IsNull() },
        { disabledAt: endpoint.disabledAt },
      );
  }

  async findEndpoint(
    merchantId: string,
    id: string,
  ): Promise<WebhookEndpoint | null> {
    const record = await this.uow
      .manager()
      .findOneBy(WebhookEndpointRecord, { id, merchantId });
    return record ? toEndpoint(record) : null;
  }

  async listEndpoints(merchantId: string): Promise<WebhookEndpoint[]> {
    const records = await this.uow.manager().find(WebhookEndpointRecord, {
      where: { merchantId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return records.map(toEndpoint);
  }

  async saveEvent(event: WebhookEvent): Promise<void> {
    const manager = this.uow.manager();
    await manager.insert(EventRecord, {
      id: event.id,
      merchantId: event.merchantId,
      type: event.type,
      data: event.data,
      createdAt: event.createdAt,
    });
    // due right away by the database clock (next_attempt_at defaults to now())
    await manager.query(
      `INSERT INTO webhook_deliveries (id, event_id, endpoint_id)
       SELECT gen_random_uuid(), $1, id
         FROM webhook_endpoints
        WHERE merchant_id = $2 AND disabled_at IS NULL`,
      [event.id, event.merchantId],
    );
  }

  async findEvent(
    merchantId: string,
    id: string,
  ): Promise<WebhookEvent | null> {
    const record = await this.uow
      .manager()
      .findOneBy(EventRecord, { id, merchantId });
    return record ? toEvent(record) : null;
  }

  async listEvents(
    merchantId: string,
    filter: { type?: string; limit: number },
  ): Promise<WebhookEvent[]> {
    const records = await this.uow.manager().find(EventRecord, {
      where: { merchantId, ...(filter.type ? { type: filter.type } : {}) },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: filter.limit,
    });
    return records.map(toEvent);
  }

  async leaseDue(
    now: Date,
    limit: number,
    leaseMs: number,
  ): Promise<DueDelivery[]> {
    const manager = this.uow.manager();
    // one statement: the claim and the lease are atomic, and rows locked by
    // another dispatcher are skipped instead of waited on
    const [leased]: [
      { id: string; attempts: number; event_id: string; endpoint_id: string }[],
      number,
    ] = await manager.query(
      `WITH due AS (
         SELECT d.id
           FROM webhook_deliveries d
           JOIN webhook_endpoints w ON w.id = d.endpoint_id
          WHERE d.status = 'pending'
            AND d.next_attempt_at <= $1
            AND w.disabled_at IS NULL
          ORDER BY d.next_attempt_at
          LIMIT $2
          FOR UPDATE OF d SKIP LOCKED
       )
       UPDATE webhook_deliveries d
          SET next_attempt_at = $1::timestamptz + make_interval(secs => $3 / 1000.0)
         FROM due
        WHERE d.id = due.id
       RETURNING d.id, d.attempts, d.event_id, d.endpoint_id`,
      [now, limit, leaseMs],
    );
    if (leased.length === 0) return [];

    const events = new Map(
      (
        await manager.findBy(EventRecord, {
          id: In(leased.map((d) => d.event_id)),
        })
      ).map((r) => [r.id, toEvent(r)]),
    );
    const endpoints = new Map(
      (
        await manager.findBy(WebhookEndpointRecord, {
          id: In(leased.map((d) => d.endpoint_id)),
        })
      ).map((r) => [r.id, toEndpoint(r)]),
    );

    return leased.map((d) => ({
      id: d.id,
      attempts: d.attempts,
      event: events.get(d.event_id)!,
      endpoint: endpoints.get(d.endpoint_id)!,
    }));
  }

  async recordSuccess(id: string, at: Date, status: number): Promise<void> {
    await this.uow.manager().query(
      `UPDATE webhook_deliveries
          SET status = 'succeeded', attempts = attempts + 1,
              last_attempt_at = $2, last_response_status = $3, last_error = NULL
        WHERE id = $1`,
      [id, at, status],
    );
  }

  async recordFailure(
    id: string,
    at: Date,
    failure: { status: number | null; error: string },
    nextAttemptAt: Date | null,
  ): Promise<void> {
    await this.uow.manager().query(
      `UPDATE webhook_deliveries
          SET status = CASE WHEN $5::timestamptz IS NULL THEN 'failed' ELSE 'pending' END,
              attempts = attempts + 1,
              next_attempt_at = COALESCE($5, next_attempt_at),
              last_attempt_at = $2, last_response_status = $3, last_error = $4
        WHERE id = $1`,
      [id, at, failure.status, failure.error.slice(0, 1000), nextAttemptAt],
    );
  }
}

function toEndpoint(record: WebhookEndpointRecord): WebhookEndpoint {
  return new WebhookEndpoint(
    record.id,
    record.merchantId,
    record.url,
    record.secret,
    record.createdAt,
    record.disabledAt,
  );
}

function toEvent(record: EventRecord): WebhookEvent {
  return new WebhookEvent(
    record.id,
    record.merchantId,
    record.type,
    record.data as { object: unknown },
    record.createdAt,
  );
}
