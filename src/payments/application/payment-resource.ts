import { Payment } from '../domain/entities/payment.entity';

/**
 * How a payment looks to merchants, in API responses and in event payloads
 * alike: the webhook a merchant receives matches GET /v1/payments/:id.
 */
export type PaymentResource = {
  id: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  description: string | null;
  metadata: Record<string, string>;
  fee: number;
  net: number;
  amountRefunded: number;
  pix: {
    txid: string;
    copiaECola: string;
    endToEndId: string | null;
    paidAt: string | null;
  } | null;
  card: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    installments: number;
    authorizationId: string | null;
  } | null;
  // why a payment failed, e.g. { code: "insufficient_funds", message: "..." }
  failure: { code: string; message: string } | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export function toPaymentResource(payment: Payment): PaymentResource {
  return {
    id: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.method,
    status: payment.status,
    description: payment.description,
    metadata: payment.metadata,
    fee: payment.fee,
    net: payment.net,
    amountRefunded: payment.amountRefunded,
    pix: payment.pix && {
      txid: payment.pix.txid,
      copiaECola: payment.pix.copiaECola,
      endToEndId: payment.pix.endToEndId,
      paidAt: payment.pix.paidAt?.toISOString() ?? null,
    },
    card: payment.card && {
      brand: payment.card.brand,
      last4: payment.card.last4,
      expMonth: payment.card.expMonth,
      expYear: payment.card.expYear,
      installments: payment.card.installments,
      authorizationId: payment.card.authorizationId,
    },
    failure: payment.failureCode
      ? {
          code: payment.failureCode,
          message:
            FAILURE_MESSAGES[payment.failureCode] ?? 'The payment failed.',
        }
      : null,
    expiresAt: payment.expiresAt.toISOString(),
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

// decline codes the acquirer returns, explained for the merchant
const FAILURE_MESSAGES: Record<string, string> = {
  card_declined: 'The card was declined by the issuer.',
  insufficient_funds: 'The card has insufficient funds.',
  expired_card: 'The issuer reports the card as expired.',
  processing_error: 'The acquirer could not process the card. Try again.',
};
