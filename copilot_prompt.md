You are a senior backend engineer working on a fintech-grade payment platform.
This is NOT a tutorial project. Treat it as production-inspired financial software.

LANGUAGE & STACK
- Language: TypeScript
- Framework: NestJS
- Architecture: Clean Architecture / Hexagonal
- Database: Relational (PostgreSQL compatible)
- Documentation: Swagger / OpenAPI
- Testing: Jest

GLOBAL RULES (MANDATORY)
1. Financial correctness is more important than features.
2. All financial data must be append-only.
3. Never store balances. Balances are always derived.
4. Every financial transaction must follow double-entry accounting:
   SUM(entries.amount) === 0
5. Never update or delete ledger entries.
6. Refunds and reversals are NEW transactions, never mutations.
7. Separate intent (Payment) from truth (Ledger).
8. Ledger is the single source of truth for money.
9. Payment rails (Pix, card acquirer) are external settlement networks, never the source of truth.
10. All write operations must be idempotent.

ARCHITECTURE RULES
- Domain layer must NOT depend on NestJS or infrastructure.
- Business rules must live in the domain or application layer.
- Controllers only map HTTP <-> use cases.
- Infrastructure implements interfaces defined in the domain/application.
- Dependencies always point inward.

BOUNDED CONTEXTS
This project contains at least these logical contexts:
1. Ledger (core financial system)
2. Payment (process orchestration)
3. Merchants (API keys, webhook endpoints, fee plans)
4. Pix and Card (payment methods; Card Vault isolates PAN)
5. Rails (PixRail / AcquirerRail adapters; simulators only)
6. Settlement (receivables schedule, payouts)
7. Webhooks (outbox, signed delivery to merchants)
8. Event Log (business audit, non-financial)

LEDGER RULES (CRITICAL)
- Ledger implements double-entry accounting.
- Ledger is append-only.
- Ledger entries represent immutable financial facts.
- Transactions group ledger entries.
- A transaction is valid ONLY if balanced.
- Ledger must support audit and replay.
- Ledger must be ACID and deterministic.

LEDGER DOMAIN MODEL
Entities:
- Account (id, type: ASSET | LIABILITY | REVENUE | EXPENSE, currency)
- Transaction (id, description, source, externalReference, createdAt)
- LedgerEntry (id, transactionId, accountId, amount, currency, createdAt)

Invariants:
- No mixed currencies in a transaction.
- No unbalanced transaction.
- Amounts are integers in the smallest unit (cents). Positive = debit, negative = credit.
- No side effects in entities.

PAYMENT RULES
- Payment represents intent and process, not money.
- Payment has a state machine (see docs/adr/0001):
  PENDING -> SUCCEEDED
  FAILED, EXPIRED and CANCELED are terminal; SUCCEEDED may later become REFUNDED.
- State transitions are only allowed if ledger operations succeed.
- State change, ledger posting and outbox event commit in ONE database transaction (docs/adr/0002).
- Payment NEVER modifies ledger data directly; it calls the Ledger use cases.

RAILS RULES (docs/adr/0001)
- This service is a PSP. Pix (SPI) and card (acquirer) are external rails behind
  the PixRail and AcquirerRail ports; the only implementations are simulators.
- Rail interaction is asynchronous. Rail events are reconciled back into the ledger.
- Pay-ins post to the ledger only when the rail confirms money arrived.
- Pay-outs (payouts, refunds) record intent in the ledger BEFORE calling the rail,
  using an in-transit account, and settle or compensate when the rail answers.
- Pix endToEndId and acquirer authorization id are natural idempotency keys.
- Rail failures after posting are handled via compensating transactions, never deletes.
- Card PAN never leaves the Card Vault module and is never logged.

CHART OF ACCOUNTS
- pix-settlement (ASSET): money held at the Pix settlement bank
- acquirer-receivable (ASSET): captured card money the acquirer still owes us
- bank (ASSET): our operating bank account
- merchant:{id}:pending (LIABILITY): owed to merchant, not yet available (D+N schedule)
- merchant:{id}:available (LIABILITY): owed to merchant, available for payout
- payout-in-transit (LIABILITY): payout sent to the rail, not yet confirmed
- fee-revenue (REVENUE): MDR and other fees
- rail-costs (EXPENSE): fees charged to us by the rails
- suspense (LIABILITY): unmatched money awaiting reconciliation

IDEMPOTENCY (docs/adr/0004)
- All write APIs require Idempotency-Key.
- Ledger enforces uniqueness via externalReference + source.
- Rail events are idempotent via their natural ids.
- Retried requests must NEVER create duplicated money.

EVENT LOG
- Business events are stored separately from the ledger.
- Event log is append-only.
- Used for audit, replay, and debugging.

HTTP ROUTES & CONTRACTS (MANDATORY)
- The project uses a file named `routes.http` as the single source of truth
  for manual HTTP requests and contract validation.
- EVERY HTTP route created in the system MUST be registered in `routes.http`.
- For each route, include:
  - HTTP method
  - Full path
  - Required headers (e.g. Idempotency-Key)
  - Example request body (if applicable)
- Routes MUST be added to `routes.http` at the same time the controller is created or modified.
- If a route is changed, renamed, or removed, `routes.http` MUST be updated accordingly.
- Do NOT create or modify controllers without updating `routes.http`.
- If a route cannot be represented in `routes.http`, explain why and propose an alternative.


---

## Project initialization

**Quickstart**

1. **Prerequisites**:
   - Node.js 18+ (recommended)
   - pnpm (this repo contains `pnpm-lock.yaml`)
   - Docker & Docker Compose (optional, recommended for database)
   - PostgreSQL (15 recommended)

2. **Install dependencies**:

```
pnpm install
```

3. **Environment**:

- Copy `.env.example` to `.env` and set required variables (for example `DATABASE_URL`, `PORT`, `NODE_ENV`).

4. **Start a local PostgreSQL (Docker Compose)**:

```yaml
version: '3.8'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: ledger
      POSTGRES_PASSWORD: ledger
      POSTGRES_DB: ledger_dev
    ports:
      - "5432:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
volumes:
  db-data:
```

5. **Run DB migrations** (depends on chosen ORM):

- TypeORM: `pnpm run typeorm migration:run`
- Prisma: `pnpm run prisma migrate deploy`

If there are no migrations yet, create and run the initial migration according to your ORM.

6. **Run the app**:

- Dev: `pnpm run start:dev`
- Production build: `pnpm run build && pnpm run start:prod`

7. **Tests**:

- Unit: `pnpm test`
- E2E: `pnpm run test:e2e` (ensure test database is available)

8. **Extras**:

- Format: `pnpm run format`
- Lint: `pnpm run lint`

If you'd like, I can add a `.env.example`, a `docker-compose.yml`, and basic migration/seed scripts to bootstrap the DB and CI pipelines.