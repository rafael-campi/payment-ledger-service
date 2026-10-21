import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { DataSource, EntityManager } from 'typeorm';

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

/**
 * Runs work from several modules in one database transaction (ADR 0002).
 * Nested runs become savepoints, so a failed inner step can be handled by its
 * caller without aborting the outer transaction.
 */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}

// module-level so every injection shares the same context
const currentManager = new AsyncLocalStorage<EntityManager>();

@Injectable()
export class TypeOrmUnitOfWork implements UnitOfWork {
  constructor(private readonly dataSource: DataSource) {}

  /** The manager of the running unit of work, or the default one outside it. */
  manager(): EntityManager {
    return currentManager.getStore() ?? this.dataSource.manager;
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    const outer = currentManager.getStore() ?? this.dataSource.manager;
    // on a transactional manager TypeORM opens a savepoint instead of a new transaction
    return outer.transaction((manager) => currentManager.run(manager, work));
  }
}
