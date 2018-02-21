export interface Adapter {
  readonly options: {};
  install(): Promise<boolean>;
  captureException(exception: any): Promise<SentryEvent>;
  captureMessage(message: string): Promise<SentryEvent>;
  captureBreadcrumb(breadcrumb: Breadcrumb): Promise<Breadcrumb>;
  send(event: SentryEvent): Promise<void>;
  setOptions(options: Options): Promise<void>;
  getContext(): Promise<Context>;
  setContext(context: Context): Promise<void>;
}

// TODO: Enumerate breadcrumb types
export type BreadcrumbType = string;

export interface Breadcrumb {
  type?: BreadcrumbType;
  level?: string; // TODO: check if same as LogLevel or Severity
  event_id?: string;
  category?: string;
  message?: string;
  data?: any;
}

export interface Context {
  tags?: Array<string>;
  extra?: object;
  user?: User;
}

// TODO: Add missing fields
export interface SentryEvent {
  message?: string;
}

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
