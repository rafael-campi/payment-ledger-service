import { Inject, Injectable } from '@nestjs/common';
import { CardInput, validateCard } from '../../domain/card';
import { VaultedCard } from '../../domain/entities/vaulted-card.entity';
import { CARD_CIPHER } from '../../domain/ports/card-cipher';
import type { CardCipher } from '../../domain/ports/card-cipher';
import { VAULT_REPOSITORY } from '../../domain/ports/vault.repository';
import type { VaultRepository } from '../../domain/ports/vault.repository';

@Injectable()
export class TokenizeCardUseCase {
  constructor(
    @Inject(VAULT_REPOSITORY) private readonly vault: VaultRepository,
    @Inject(CARD_CIPHER) private readonly cipher: CardCipher,
  ) {}

  /** Validates the card and stores it encrypted; the CVC is checked, never kept. */
  async execute(merchantId: string, input: CardInput): Promise<VaultedCard> {
    const now = new Date();
    const { pan, brand } = validateCard(input, now);

    const card = VaultedCard.create(
      merchantId,
      { brand, pan, expMonth: input.expMonth, expYear: input.expYear },
      input.holderName?.trim() || null,
      now,
    );
    await this.vault.save(card, this.cipher.encrypt(pan, card.id));
    return card;
  }
}
