import { ConflictError, DomainError } from '../../../shared/errors';
import { Account, AccountType } from '../../domain/entities/account.entity';
import { Transaction } from '../../domain/entities/transaction.entity';
import { DuplicateTransactionReferenceError } from '../../domain/ports/ledger.repository';
import { InMemoryLedgerRepository } from '../../infrastructure/persistence/in-memory-ledger.repository';
import {
  PostLedgerTransactionInput,
  PostLedgerTransactionUseCase,
} from './post-ledger-transaction.usecase';

const pixReceived = (): PostLedgerTransactionInput => ({
  description: 'Pix received',
  source: 'pix',
  externalReference: 'E00000000202610211200abc',
  entries: [
    { accountId: 'pix-settlement', amount: 10000, currency: 'BRL' },
    { accountId: 'merchant:7:pending', amount: -9901, currency: 'BRL' },
    { accountId: 'fee-revenue', amount: -99, currency: 'BRL' },
  ],
});

describe('PostLedgerTransactionUseCase', () => {
  let repository: InMemoryLedgerRepository;
  let useCase: PostLedgerTransactionUseCase;

  beforeEach(async () => {
    repository = new InMemoryLedgerRepository();
    await repository.insertAccounts([
      new Account('pix-settlement', AccountType.ASSET, 'BRL'),
      new Account('merchant:7:pending', AccountType.LIABILITY, 'BRL'),
      new Account('fee-revenue', AccountType.REVENUE, 'BRL'),
      new Account('usd-cash', AccountType.ASSET, 'USD'),
    ]);
    useCase = new PostLedgerTransactionUseCase(repository);
  });

  const codeOf = (promise: Promise<unknown>) =>
    promise.then(
      () => undefined,
      (error: unknown) => (error instanceof DomainError ? error.code : error),
    );

  it('rejects entries on accounts that do not exist', async () => {
    const input = pixReceived();
    input.entries[1].accountId = 'merchant:unknown:pending';

    expect(await codeOf(useCase.execute(input))).toBe('ledger.unknown_account');
    expect(await repository.listTransactions()).toHaveLength(0);
  });

  it('rejects entries in a currency the account does not hold', async () => {
    const input: PostLedgerTransactionInput = {
      description: 'wrong currency',
      source: 'manual',
      externalReference: 'm-1',
      entries: [
        { accountId: 'usd-cash', amount: 100, currency: 'BRL' },
        { accountId: 'fee-revenue', amount: -100, currency: 'BRL' },
      ],
    };

    expect(await codeOf(useCase.execute(input))).toBe(
      'ledger.account_currency_mismatch',
    );
  });

  it('appends a balanced transaction', async () => {
    const tx = await useCase.execute(pixReceived());

    expect(tx.entries).toHaveLength(3);
    expect(tx.entries.every((e) => e.transactionId === tx.id)).toBe(true);
    expect(await repository.listTransactions()).toEqual([tx]);
  });

  it('returns the existing transaction when the same reference is posted again', async () => {
    const first = await useCase.execute(pixReceived());
    const reordered = pixReceived();
    reordered.entries.reverse();

    const second = await useCase.execute(reordered);

    expect(second.id).toBe(first.id);
    expect(await repository.listTransactions()).toHaveLength(1);
  });

  it('rejects the same reference with different content', async () => {
    await useCase.execute(pixReceived());
    const tampered = pixReceived();
    tampered.entries[1].amount = -9900;
    tampered.entries[2].amount = -100;

    await expect(useCase.execute(tampered)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(await repository.listTransactions()).toHaveLength(1);
  });

  it('resolves a race lost to a concurrent post of the same reference', async () => {
    const winner = await useCase.execute(pixReceived());
    // simulate: our read happened before the winner's write
    jest
      .spyOn(repository, 'findByReference')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    const save = jest.spyOn(repository, 'saveTransaction');

    const result: Transaction = await useCase.execute(pixReceived());

    expect(save.mock.results[0]).toBeDefined();
    await expect(save.mock.results[0].value).rejects.toBeInstanceOf(
      DuplicateTransactionReferenceError,
    );
    expect(result.id).toBe(winner.id);
  });
});
