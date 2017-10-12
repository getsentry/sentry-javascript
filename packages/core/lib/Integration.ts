import { Event } from './Interfaces';
import { Options } from './Core';

export namespace Integration {
  export type Result<T> = {
    sdk: Integration;
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

export interface Integration {
  readonly dsn: string;
  readonly options: Integration.Options;
  install(): Promise<Integration.Result<boolean>>;
  send(event: Event): Promise<Integration.Result<Event>>;
  captureEvent(event: Event): Promise<Event>;
}
