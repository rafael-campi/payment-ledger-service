import { Refund } from '../domain/entities/refund.entity';

export type RefundResource = {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: string;
  reason: string | null;
  // how the merchant's balance paid for it
  fundedFrom: { pending: number; available: number };
  railReference: string | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toRefundResource(refund: Refund): RefundResource {
  return {
    id: refund.id,
    paymentId: refund.paymentId,
    amount: refund.amount,
    currency: refund.currency,
    status: refund.status,
    reason: refund.reason,
    fundedFrom: {
      pending: refund.fromPending,
      available: refund.fromAvailable,
    },
    railReference: refund.railReference,
    failureCode: refund.failureCode,
    createdAt: refund.createdAt.toISOString(),
    updatedAt: refund.updatedAt.toISOString(),
  };
}
