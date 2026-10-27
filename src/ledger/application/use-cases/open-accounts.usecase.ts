import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, DomainError } from '../../../shared/errors';
import { Account, AccountType } from '../../domain/entities/account.entity';
import { LEDGER_REPOSITORY } from '../../domain/ports/ledger.repository';
import type { LedgerRepository } from '../../domain/ports/ledger.repository';

export type OpenAccountInput = {
  id: string;
  type: AccountType;
  currency: string;
};

const ACCOUNT_ID = /^[a-z0-9][a-z0-9:_-]{0,127}$/;
const CURRENCY = /^[A-Z]{3}$/;

@Injectable()
export class OpenAccountsUseCase {
  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly repository: LedgerRepository,
  ) {}

  /**
   * Idempotent: an account that already exists with the same type and
   * currency is fine; one that exists with a different definition is a conflict.
   */
  async execute(inputs: OpenAccountInput[]): Promise<Account[]> {
    for (const input of inputs) {
      if (!ACCOUNT_ID.test(input.id)) {
        throw new DomainError(
          'ledger.invalid_account_id',
          `Account id "${input.id}" must be lowercase letters, digits, ":", "_" or "-".`,
        );
      }
      if (!CURRENCY.test(input.currency)) {
        throw new DomainError(
          'ledger.invalid_currency',
          `Currency must be an ISO 4217 code (got ${input.currency}).`,
        );
      }
    }

    const existing = new Map(
      (await this.repository.findAccounts(inputs.map((i) => i.id))).map((a) => [
        a.id,
        a,
      ]),
    );
    for (const input of inputs) {
      const account = existing.get(input.id);
      if (
        account &&
        (account.type !== input.type || account.currency !== input.currency)
      ) {
        throw new ConflictError(
          'ledger.account_conflict',
          `Account ${input.id} already exists as ${account.type} in ${account.currency}.`,
        );
      }
    }

    const accounts = inputs.map((i) => new Account(i.id, i.type, i.currency));
    await this.repository.insertAccounts(
      accounts.filter((a) => !existing.has(a.id)),
    );
    return accounts;
  }
}
