import { ConflictError, DomainError } from '../../../shared/errors';
import { AccountType } from '../../domain/entities/account.entity';
import { InMemoryLedgerRepository } from '../../infrastructure/persistence/in-memory-ledger.repository';
import { OpenAccountsUseCase } from './open-accounts.usecase';

describe('OpenAccountsUseCase', () => {
  let repository: InMemoryLedgerRepository;
  let useCase: OpenAccountsUseCase;

  beforeEach(() => {
    repository = new InMemoryLedgerRepository();
    useCase = new OpenAccountsUseCase(repository);
  });

  const pending = {
    id: 'merchant:mch_1:pending',
    type: AccountType.LIABILITY,
    currency: 'BRL',
  };

  it('opens accounts that start with a zero balance', async () => {
    await useCase.execute([pending]);

    const [row] = await repository.accountBalances([pending.id]);
    expect(row.account).toMatchObject(pending);
    expect(row.balance).toBe(0);
  });

  it('is idempotent for an identical definition', async () => {
    await useCase.execute([pending]);
    await expect(useCase.execute([pending])).resolves.toHaveLength(1);
  });

  it('rejects reopening an account with another type or currency', async () => {
    await useCase.execute([pending]);

    await expect(
      useCase.execute([{ ...pending, type: AccountType.ASSET }]),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      useCase.execute([{ ...pending, currency: 'USD' }]),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it.each([
    ['an uppercase id', { ...pending, id: 'Merchant:1' }],
    ['an id with spaces', { ...pending, id: 'merchant 1' }],
    ['a malformed currency', { ...pending, currency: 'real' }],
  ])('rejects %s', async (_, input) => {
    await expect(useCase.execute([input])).rejects.toBeInstanceOf(DomainError);
    expect(await repository.accountBalances()).toHaveLength(0);
  });
});
