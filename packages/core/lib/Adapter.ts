import {Event, Breadcrumb, User} from './Interfaces';

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

  // These should be removed at some point in the future
  // only the client should handle global stuff
  setUserContext?(user?: User): Adapter;
  setTagsContext?(tags?: {[key: string]: any}): Adapter;
  setExtraContext?(extra?: {[key: string]: any}): Adapter;
  clearContext?(): Adapter;
}
