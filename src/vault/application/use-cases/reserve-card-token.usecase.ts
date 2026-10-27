import { Inject, Injectable } from '@nestjs/common';
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from '../../../shared/errors';
import { VaultedCard } from '../../domain/entities/vaulted-card.entity';
import { VAULT_REPOSITORY } from '../../domain/ports/vault.repository';
import type { VaultRepository } from '../../domain/ports/vault.repository';

@Injectable()
export class ReserveCardTokenUseCase {
  constructor(
    @Inject(VAULT_REPOSITORY) private readonly vault: VaultRepository,
  ) {}

  /**
   * Binds a single-use token to one payment, inside the caller's unit of
   * work. Reserving it again for the same payment is a no-op.
   */
  async execute(
    merchantId: string,
    tokenId: string,
    paymentId: string,
  ): Promise<VaultedCard> {
    const card = await this.vault.lockById(merchantId, tokenId);
    if (!card) {
      throw new NotFoundError(
        'vault.token_not_found',
        `Card token ${tokenId} does not exist.`,
      );
    }
    if (card.redeemedByPayment === paymentId) return card;
    if (card.redeemedByPayment || card.purgedAt) {
      throw new ConflictError(
        'vault.token_used',
        `Card token ${tokenId} was already used. Tokenize the card again.`,
      );
    }
    if (card.expiresAt <= new Date()) {
      throw new DomainError(
        'vault.token_expired',
        `Card token ${tokenId} has expired. Tokenize the card again.`,
      );
    }

    await this.vault.markRedeemed(tokenId, paymentId, new Date());
    return card;
  }
}
