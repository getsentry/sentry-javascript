import { Event, IBreadcrumb, IUser } from './Interfaces';

export interface IAdapter {
  readonly options: {};
  install(): Promise<boolean>;
  setOptions(options: {}): IAdapter;
  send(event: Event): Promise<Event>;
  captureException(exception: Error): Promise<Event>;
  captureMessage(message: string): Promise<Event>;
  captureBreadcrumb(crumb: IBreadcrumb): Promise<IBreadcrumb>;

  // These should be removed at some point in the future
  // only the client should handle global stuff
  setUserContext?(user?: IUser): IAdapter;
  setTagsContext?(tags?: { [key: string]: any }): IAdapter;
  setExtraContext?(extra?: { [key: string]: any }): IAdapter;
  clearContext?(): IAdapter;
}
