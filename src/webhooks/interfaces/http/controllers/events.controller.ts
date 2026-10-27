import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentMerchantId } from '../../../../shared/auth/principal';
import { MerchantAuthGuard } from '../../../../merchants/interfaces/http/merchant-auth.guard';
import { ListEventsUseCase } from '../../../application/use-cases/list-events.usecase';
import { GetEventUseCase } from '../../../application/use-cases/get-event.usecase';
import { EventDto, ListEventsQueryDto } from '../dto/webhooks.dto';

/** Lets merchants reconcile what their webhook endpoint may have missed. */
@Controller('v1/events')
@UseGuards(MerchantAuthGuard)
export class EventsController {
  constructor(
    private readonly listEvents: ListEventsUseCase,
    private readonly getEvent: GetEventUseCase,
  ) {}

  @Get()
  async list(
    @CurrentMerchantId() merchantId: string,
    @Query() query: ListEventsQueryDto,
  ): Promise<EventDto[]> {
    const events = await this.listEvents.execute(merchantId, {
      type: query.type,
      limit: query.limit ?? 20,
    });
    return events.map((e) => EventDto.from(e));
  }

  @Get(':id')
  async findOne(
    @CurrentMerchantId() merchantId: string,
    @Param('id') id: string,
  ): Promise<EventDto> {
    return EventDto.from(await this.getEvent.execute(merchantId, id));
  }
}
