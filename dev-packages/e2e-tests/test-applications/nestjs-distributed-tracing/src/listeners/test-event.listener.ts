import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class TestEventListener {
  @OnEvent('myEvent.pass')
  async handlePassEvent(payload: any): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  @OnEvent('myEvent.throw')
  async handleThrowEvent(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 100));
    throw new Error('Test error from event handler');
  }
}
