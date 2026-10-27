import {
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';

/**
 * Runs `tick` every N ms without overlapping runs. N comes from an env var;
 * 0 disables the job (tests call the use case directly instead).
 */
export abstract class IntervalJob
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(this.constructor.name);

  protected abstract readonly intervalEnvVar: string;
  protected abstract readonly defaultIntervalMs: number;
  protected abstract tick(): Promise<unknown>;

  onApplicationBootstrap(): void {
    const configured = process.env[this.intervalEnvVar];
    const ms =
      configured === undefined ? this.defaultIntervalMs : Number(configured);
    if (!(ms > 0)) return;

    this.timer = setInterval(() => void this.run(), ms);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.tick();
    } catch (error) {
      this.logger.error(error instanceof Error ? error.stack : error);
    } finally {
      this.running = false;
    }
  }
}
