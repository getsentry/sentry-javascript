import { Controller, Get } from '@nestjs/common';
import { EventsService } from './events.service';
import { reportIsolationScopeOnSpan } from './utils';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('emit')
  async emitEvents() {
    await this.eventsService.emitEvents();

    return { message: 'Events emitted' };
  }

  @Get('emit-multiple')
  async emitMultipleEvents() {
    await this.eventsService.emitMultipleEvents();
    reportIsolationScopeOnSpan();

    return { message: 'Events emitted' };
  }

  @Get('test-isolation')
  testIsolation() {
    reportIsolationScopeOnSpan();

    return { message: 'ok' };
  }
}
