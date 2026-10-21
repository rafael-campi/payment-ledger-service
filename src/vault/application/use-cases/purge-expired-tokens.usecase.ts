import { Inject, Injectable } from '@nestjs/common';
import { VAULT_REPOSITORY } from '../../domain/ports/vault.repository';
import type { VaultRepository } from '../../domain/ports/vault.repository';

@Injectable()
export class PurgeExpiredTokensUseCase {
  constructor(
    @Inject(VAULT_REPOSITORY) private readonly vault: VaultRepository,
  ) {}

  /** Erases card numbers of tokens that expired unused; returns how many. */
  execute(now: Date = new Date()): Promise<number> {
    return this.vault.purgeExpiredUnused(now);
  }
}
