import { Event } from './Interface';
import { Options } from './Core';

export namespace Sdk {
  export type Result<T> = {
    sdk: Interface;
    value?: T;
  };

  export type Options = {
    /**
     * This number determines which Sdk should send the event
     * default: (should be) 1000
     */
    rank: number;
  };

  export interface Interface {
    readonly dsn: string;
    readonly options: Options;
    install(): Promise<Result<boolean>>;
    send(event: Event): Promise<Result<Event>>;
    captureEvent(event: Event): Promise<Event>;
  }
}
