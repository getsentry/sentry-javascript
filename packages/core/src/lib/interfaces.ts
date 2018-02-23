export enum Severity {
  Fatal = 'fatal',
  Error = 'error',
  Warning = 'warning',
  Info = 'info',
  Debug = 'debug',
  Critical = 'critical',
}

export interface Breadcrumb {
  type?: string;
  level?: Severity;
  event_id?: string;
  category?: string;
  message?: string;
  data?: any;
  timestamp?: number;
}

export interface User {
  id?: string;
  email?: string;
  username?: string;
  extra?: any;
}

export interface Context {
  tags?: { [key: string]: string };
  extra?: object;
  user?: User;
}

// TODO: Add missing fields
export interface SentryEvent extends Context {
  message?: string;
  breadcrumbs?: Breadcrumb[];
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
  shouldSend?: (e: SentryEvent) => boolean;
  beforeSend?: (e: SentryEvent) => SentryEvent;
  afterSend?: (e: SentryEvent) => void;
  shouldAddBreadcrumb?: (b: Breadcrumb) => boolean;
  beforeBreadcrumb?: (b: Breadcrumb) => Breadcrumb;
  afterBreadcrumb?: (b: Breadcrumb) => Breadcrumb;
}

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
