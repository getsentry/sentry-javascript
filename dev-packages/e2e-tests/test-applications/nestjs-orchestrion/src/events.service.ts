import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as Sentry from '@sentry/nestjs';

@Injectable()
export class EventsService {
  // `@OnEvent` opens an `event.nestjs` transaction per handled event.
  @OnEvent('test.event')
  public handleTestEvent(): void {
    Sentry.startSpan({ name: 'test-event-child-span' }, () => undefined);
  }
}
