import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('webhook_endpoints')
export class WebhookEndpointRecord {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 32 })
  merchantId: string;

  @Column({ type: 'varchar', length: 2048 })
  url: string;

  @Column({ type: 'varchar', length: 64 })
  secret: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'disabled_at', type: 'timestamptz', nullable: true })
  disabledAt: Date | null;
}

@Entity('events')
export class EventRecord {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 32 })
  merchantId: string;

  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ type: 'jsonb' })
  data: object; // { object: <resource snapshot> }

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
