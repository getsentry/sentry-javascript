import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class EventsService {
  constructor(private readonly eventEmitter: EventEmitter2) {
    // Emit event periodically outside of HTTP context to test isolation scope behavior.
    // setInterval runs in the default async context (no HTTP request), so without proper
    // isolation scope forking, the breadcrumb set by the handler leaks into the default
    // isolation scope and gets cloned into subsequent HTTP requests.
    setInterval(() => {
      this.eventEmitter.emit('test-isolation.breadcrumb');
    }, 2000);
  }

  async emitEvents() {
    await this.eventEmitter.emit('myEvent.pass', { data: 'test' });
    await this.eventEmitter.emit('myEvent.throw');

    return { message: 'Events emitted' };
  }

  async emitMultipleEvents() {
    this.eventEmitter.emit('multiple.first', { data: 'test-first' });
    this.eventEmitter.emit('multiple.second', { data: 'test-second' });

    return { message: 'Events emitted' };
  }
}
