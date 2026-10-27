export const WEBHOOK_SENDER = Symbol('WEBHOOK_SENDER');

export interface WebhookSender {
  /** Resolves with the HTTP status; rejects on network errors and timeouts. */
  send(
    url: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<{ status: number }>;
}
