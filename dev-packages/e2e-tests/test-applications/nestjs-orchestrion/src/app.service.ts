import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as Sentry from '@sentry/nestjs';

@Injectable()
export class AppService {
  public constructor(private readonly eventEmitter: EventEmitter2) {}

  public testSpan(): void {
    // A child span, to verify request handling nests under the nestjs spans.
    Sentry.startSpan({ name: 'test-controller-span' }, () => undefined);
  }

  public emitEvent(): void {
    this.eventEmitter.emit('test.event', { hello: 'world' });
  }
}
