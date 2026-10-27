import { Payout } from '../domain/entities/payout.entity';
import { Receivable } from '../domain/entities/receivable.entity';

export type ReceivableResource = {
  id: string;
  paymentId: string;
  installment: number;
  amount: number; // what will be (or was) released
  currency: string;
  availableOn: string;
  status: 'scheduled' | 'released';
};

export function toReceivableResource(r: Receivable): ReceivableResource {
  return {
    id: r.id,
    paymentId: r.paymentId,
    installment: r.installment,
    amount: r.remaining,
    currency: r.currency,
    availableOn: r.availableOn.toISOString(),
    status: r.releasedAt ? 'released' : 'scheduled',
  };
}

export type PayoutResource = {
  id: string;
  amount: number;
  currency: string;
  pixKey: string;
  status: string;
  endToEndId: string | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toPayoutResource(p: Payout): PayoutResource {
  return {
    id: p.id,
    amount: p.amount,
    currency: p.currency,
    pixKey: p.pixKey,
    status: p.status,
    endToEndId: p.endToEndId,
    failureCode: p.failureCode,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
