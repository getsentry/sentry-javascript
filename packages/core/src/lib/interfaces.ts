export interface Adapter {
  readonly options: {};
  install(): Promise<boolean>;
  capture(event: Event): Promise<any>; // FIXME: swap any for interface
  send(event: Event): Promise<any>; // FIXME: swap any for interface
  wrap(fn: Function, options: object): Function;
  setOptions(options: Options): Promise<Adapter>;
  getContext(): Promise<Context>;
  setContext(context: Context): Promise<Adapter>;
}

export interface Breadcrumb {
  type?: string;
  level?: string; // TODO: check if same as LogLevel or Severity
  event_id?: string;
  category?: string;
  message?: string;
  data?: any;
}

export interface Context {
  tags?: Array<string | number>;
  extra?: object;
  user?: User;
}

interface ExceptionEvent {
  type: 'exception';
  payload: object | Error;
}

interface MessageEvent {
  type: 'message';
  payload: string | number;
}

interface BreadcrumbEvent {
  type: 'breadcrumb';
  payload: Breadcrumb;
}

export type Event = ExceptionEvent | MessageEvent | BreadcrumbEvent;

export enum LogLevel {
  None = 0,
  Error = 1,
  Debug = 2,
  Verbose = 3,
}

// TODO: Rework options
export interface Options {
  release?: string;
  environment?: string;
  logLevel?: LogLevel;
  maxBreadcrumbs?: number;
  ignoreErrors?: Array<string | RegExp>;
  ignoreUrls?: Array<string | RegExp>;
  whitelistUrls?: Array<string | RegExp>;
  includePaths?: Array<string | RegExp>;
  shouldSendCallback?: Function;
  dataCallback?: Function;
  beforeSendCallback?: Function;
  afterSendCallback?: Function;
  beforeCaptureCallback?: Function;
  afterCaptureCallback?: Function;
  beforeBreadcrumbCallback?: Function;
  afterBreadcrumbCallback?: Function;
}

export enum Severity {
  Fatal,
  Error,
  Warning,
  Info,
  Debug,
  Critical,
}

export interface User {
  id?: string;
  email?: string;
  username?: string;
  extra?: any;
}
