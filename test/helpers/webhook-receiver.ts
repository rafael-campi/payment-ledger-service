import { createServer, IncomingHttpHeaders, Server } from 'http';
import { AddressInfo } from 'net';

export type ReceivedWebhook = {
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
};

/**
 * A merchant's webhook endpoint on localhost. Every path is accepted, so each
 * test can register its own URL (`receiver.url('/test-name')`) and read only
 * its deliveries back.
 */
export class WebhookReceiver {
  private readonly received: ReceivedWebhook[] = [];
  private readonly statuses = new Map<string, number[]>();
  private server?: Server;
  private baseUrl = '';

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        const path = req.url ?? '/';
        this.received.push({ path, headers: req.headers, body });
        res.statusCode = this.statuses.get(path)?.shift() ?? 200;
        res.end();
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, resolve));
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://localhost:${port}`;
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.server?.close(resolve));
  }

  url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  /** Next responses for `path`, in order; 200 once they run out. */
  respondWith(path: string, ...statuses: number[]): void {
    this.statuses.set(path, statuses);
  }

  deliveriesTo(path: string): ReceivedWebhook[] {
    return this.received.filter((r) => r.path === path);
  }
}
