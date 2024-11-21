import { Controller, Get } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('emit')
  async emitEvents() {
    await this.eventsService.emitEvents();

    return { message: 'Events emitted' };
  }
}
