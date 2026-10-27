import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PlatformGuard } from '../../../shared/auth/platform.guard';
import { Idempotent } from '../../../shared/idempotency/idempotency.interceptor';
import {
  ReconcileUseCase,
  ReconciliationReport,
} from '../../application/use-cases/reconcile.usecase';
import {
  ListSuspenseUseCase,
  SuspenseItem,
} from '../../application/use-cases/list-suspense.usecase';
import { ReturnSuspenseUseCase } from '../../application/use-cases/return-suspense.usecase';

/** Operator tools: is the money where it should be, and what is unclaimed. */
@Controller('platform')
@UseGuards(PlatformGuard)
export class ReconciliationController {
  constructor(
    private readonly reconcile: ReconcileUseCase,
    private readonly listSuspense: ListSuspenseUseCase,
    private readonly returnSuspense: ReturnSuspenseUseCase,
  ) {}

  @Get('reconciliation')
  report(): Promise<ReconciliationReport> {
    return this.reconcile.execute();
  }

  @Get('suspense')
  suspense(): Promise<SuspenseItem[]> {
    return this.listSuspense.execute();
  }

  @Post('suspense/:endToEndId/return')
  @Idempotent()
  returnToPayer(
    @Param('endToEndId') endToEndId: string,
  ): Promise<SuspenseItem> {
    return this.returnSuspense.execute(endToEndId);
  }
}
