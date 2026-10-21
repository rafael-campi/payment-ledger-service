import { Inject, Injectable } from '@nestjs/common';
import { VAULT_REPOSITORY } from '../../domain/ports/vault.repository';
import type { VaultRepository } from '../../domain/ports/vault.repository';

@Injectable()
export class PurgeCardUseCase {
  constructor(
    @Inject(VAULT_REPOSITORY) private readonly vault: VaultRepository,
  ) {}

  /** Once the acquirer has answered, the number is not needed anymore. */
  async execute(tokenId: string): Promise<void> {
    await this.vault.purge(tokenId, new Date());
  }
}
