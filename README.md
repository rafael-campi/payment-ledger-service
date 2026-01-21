
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