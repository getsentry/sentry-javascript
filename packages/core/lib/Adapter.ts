import { Event } from './Interfaces';
import { Options } from './Core';

export namespace Adapter {
  export type Result<T> = {
    sdk: Adapter;
    value?: T;
  };

  export type Options = {
    /**
     * This number determines the order in which the Integrations will be called.
     * Also only the Integration with the lowest rank will send the event in the end.
     * e.g.: If I use Browser Integration with rank 1000
     * and also add React Native Integration with rank 900
     * both integrations call the capture function but only React Native will send the
     * event.
     *
     * default: (should be) 1000
     */
    rank: number;
  };
}

export interface Adapter {
  readonly dsn: string;
  readonly options: Adapter.Options;
  install(): Promise<Adapter.Result<boolean>>;
  send(event: Event): Promise<Adapter.Result<Event>>;
  captureEvent(event: Event): Promise<Event>;
  captureException(exception: Error, event: Event): Promise<Event>;
}
