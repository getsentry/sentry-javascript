import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class EventsService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

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
