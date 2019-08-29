import { Breadcrumb } from './breadcrumb';
import { Exception } from './exception';
import { Request } from './request';
import { SdkInfo } from './sdkinfo';
import { Severity } from './severity';
import { Stacktrace } from './stacktrace';
import { Thread } from './thread';
import { User } from './user';

/** JSDoc */
export interface Event {
  event_id?: string;
  message?: string;
  timestamp?: number;
  level?: Severity;
  platform?: string;
  logger?: string;
  server_name?: string;
  release?: string;
  dist?: string;
  environment?: string;
  sdk?: SdkInfo;
  request?: Request;
  transaction?: string;
  modules?: { [key: string]: string };
  fingerprint?: string[];
  exception?: {
    values?: Exception[];
  };
  /**
   * @deprecated Top-level `stacktrace` attribute has been deprecated. Use event.threads.0.stacktrace instead.
   * See https://docs.sentry.io/development/sdk-dev/event-payloads/stacktrace/ for more informations.
   */
  stacktrace?: Stacktrace;
  breadcrumbs?: Breadcrumb[];
  contexts?: { [key: string]: object };
  tags?: { [key: string]: string };
  extra?: { [key: string]: any };
  user?: User;
  type?: EventType;
  threads?: Thread[];
}

/** JSDoc */
export type EventType = 'none';

/** JSDoc */
export interface EventHint {
  event_id?: string;
  syntheticException?: Error | null;
  originalException?: Error | string | null;
  data?: any;
}
