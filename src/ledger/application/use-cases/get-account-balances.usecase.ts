import { Inject, Injectable } from '@nestjs/common';
import { LEDGER_REPOSITORY } from '../../domain/ports/ledger.repository';
import type {
  AccountBalance,
  LedgerRepository,
} from '../../domain/ports/ledger.repository';

@Injectable()
export class GetAccountBalancesUseCase {
  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly repository: LedgerRepository,
  ) {}

  /** All accounts when ids is omitted. */
  async execute(ids?: string[]): Promise<AccountBalance[]> {
    return this.repository.accountBalances(ids);
  }
}
