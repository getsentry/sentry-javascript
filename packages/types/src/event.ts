import { Attachment } from './attachment';
import { Breadcrumb } from './breadcrumb';
import { Contexts } from './context';
import { DebugMeta } from './debugMeta';
import { Exception } from './exception';
import { Extras } from './extra';
import { Measurements } from './measurement';
import { Primitive } from './misc';
import { Request } from './request';
import { CaptureContext } from './scope';
import { SdkInfo } from './sdkinfo';
import { Severity, SeverityLevel } from './severity';
import { Span } from './span';
import { TransactionNameChange, TransactionSource } from './transaction';
import { User } from './user';

/** JSDoc */
export interface Event {
  event_id?: string;
  message?: string;
  timestamp?: number;
  start_timestamp?: number;
  // eslint-disable-next-line deprecation/deprecation
  level?: Severity | SeverityLevel;
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
  breadcrumbs?: Breadcrumb[];
  contexts?: Contexts;
  tags?: { [key: string]: Primitive };
  extra?: Extras;
  user?: User;
  type?: EventType;
  spans?: Span[];
  measurements?: Measurements;
  debug_meta?: DebugMeta;
  // A place to stash data which is needed at some point in the SDK's event processing pipeline but which shouldn't get sent to Sentry
  sdkProcessingMetadata?: { [key: string]: any };
  transaction_info?: {
    source: TransactionSource;
    name_changes: TransactionNameChange[];
    propagations: number;
  };
}

/** JSDoc */
export type EventType = 'transaction';

/** JSDoc */
export interface EventHint {
  event_id?: string;
  captureContext?: CaptureContext;
  syntheticException?: Error | null;
  originalException?: Error | string | null;
  attachments?: Attachment[];
  data?: any;
}
