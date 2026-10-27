import { Injectable } from '@nestjs/common';
import { WebhookSender } from '../../domain/ports/webhook-sender';

// shorter than the dispatcher's lease, so a slow endpoint is not sent the event twice
const TIMEOUT_MS = 10_000;

@Injectable()
export class FetchWebhookSender implements WebhookSender {
  async send(
    url: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<{ status: number }> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual', // a redirect is a misconfigured endpoint, not a success
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await response.body?.cancel();
    return { status: response.status };
  }
}
