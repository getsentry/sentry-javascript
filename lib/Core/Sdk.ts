import { Event } from './Interface/Event';
import { Options } from '../Core/Core';

export namespace Sdk {
  export type Result<T> = {
    sdk: Interface;
    value?: T;
  };
  // There are no internal functions yet
  // so we have to go with _
  export interface Interface {
    readonly dsn: string;
    readonly options: Options;
    install(): Promise<Result<boolean>>;
    send(event: Event): Promise<Result<Event>>;
    captureEvent(event: Event): Promise<Event>;
  }
}
