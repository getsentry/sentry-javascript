import {Event, Breadcrumb} from './Interfaces';

export namespace Adapter {
  export type Options = {};
}

export interface Adapter {
  readonly options: Adapter.Options;
  install(): Promise<boolean>;
  setOptions(options: Adapter.Options): Adapter;
  send(event: Event): Promise<Event>;
  captureException(exception: Error): Promise<Event>;
  captureMessage(message: string): Promise<Event>;
  captureBreadcrumb(crumb: Breadcrumb): Promise<Breadcrumb>;
}
