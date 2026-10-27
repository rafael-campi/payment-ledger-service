import { Injectable } from '@nestjs/common';
import { Transaction } from '../../domain/entities/transaction.entity';
import { validateManualPosting } from '../../domain/rules/manual-posting.rule';
import {
  PostLedgerTransactionInput,
  PostLedgerTransactionUseCase,
} from './post-ledger-transaction.usecase';

/**
 * An operator's adjustment through POST /ledger/transactions. Same ledger
 * rules, plus: no reserved sources and no scheduled accounts, so that
 * reconciliation can always explain where money came from.
 */
@Injectable()
export class PostManualTransactionUseCase {
  constructor(private readonly post: PostLedgerTransactionUseCase) {}

  execute(input: PostLedgerTransactionInput): Promise<Transaction> {
    validateManualPosting(input);
    return this.post.execute(input);
  }
}
