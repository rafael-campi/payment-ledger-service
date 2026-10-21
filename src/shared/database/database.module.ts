import { Global, Module } from '@nestjs/common';
import { TypeOrmUnitOfWork, UNIT_OF_WORK } from './unit-of-work';

@Global()
@Module({
  providers: [
    TypeOrmUnitOfWork,
    { provide: UNIT_OF_WORK, useExisting: TypeOrmUnitOfWork },
  ],
  exports: [TypeOrmUnitOfWork, UNIT_OF_WORK],
})
export class DatabaseModule {}
