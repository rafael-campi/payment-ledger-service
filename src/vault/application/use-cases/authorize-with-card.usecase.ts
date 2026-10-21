import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../shared/errors';
import { ACQUIRER_RAIL } from '../../../rails/acquirer-rail';
import type {
  AcquirerRail,
  AuthorizationResult,
} from '../../../rails/acquirer-rail';
import { CARD_CIPHER } from '../../domain/ports/card-cipher';
import type { CardCipher } from '../../domain/ports/card-cipher';
import { VAULT_REPOSITORY } from '../../domain/ports/vault.repository';
import type { VaultRepository } from '../../domain/ports/vault.repository';

/**
 * The one place a card number is decrypted: the vault hands it straight to
 * the acquirer and returns only the answer (ADR 0002). Payments never see it.
 */
@Injectable()
export class AuthorizeWithCardUseCase {
  constructor(
    @Inject(VAULT_REPOSITORY) private readonly vault: VaultRepository,
    @Inject(CARD_CIPHER) private readonly cipher: CardCipher,
    @Inject(ACQUIRER_RAIL) private readonly acquirer: AcquirerRail,
  ) {}

  async execute(input: {
    merchantId: string;
    tokenId: string;
    paymentId: string;
    amount: number;
    installments: number;
  }): Promise<AuthorizationResult> {
    // no lock: this runs outside any transaction while the acquirer answers
    const card = await this.vault.findById(input.merchantId, input.tokenId);
    const encrypted = await this.vault.findEncryptedPan(input.tokenId);
    if (!card || card.redeemedByPayment !== input.paymentId || !encrypted) {
      throw new DomainError(
        'vault.token_unavailable',
        `Card token ${input.tokenId} cannot authorize payment ${input.paymentId}.`,
      );
    }

    return this.acquirer.authorize({
      // the payment id: a retried authorization gets the same answer
      idempotencyKey: input.paymentId,
      pan: this.cipher.decrypt(encrypted, card.id),
      expMonth: card.expMonth,
      expYear: card.expYear,
      amount: input.amount,
      installments: input.installments,
    });
  }
}
