import type { Attachment } from './attachment';
import type { Breadcrumb } from './breadcrumb';
import type { Contexts } from './context';
import type { DebugMeta } from './debugMeta';
import type { Exception } from './exception';
import type { Extras } from './extra';
import type { Measurements } from './measurement';
import type { Primitive } from './misc';
import type { Request } from './request';
import type { CaptureContext } from './scope';
import type { SdkInfo } from './sdkinfo';
import type { Severity, SeverityLevel } from './severity';
import type { Span } from './span';
import type { Thread } from './thread';
import type { TransactionNameChange, TransactionSource } from './transaction';
import type { User } from './user';

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
    changes: TransactionNameChange[];
    propagations: number;
  };
  threads?: {
    values: Thread[];
  };
}

/**
 * The type of an `Event`.
 * Note that `ErrorEvent`s do not have a type (hence its undefined),
 * while all other events are required to have one.
 */
export type EventType = 'transaction' | 'profile' | 'replay_event' | undefined;

export interface ErrorEvent extends Event {
  type: undefined;
}
export interface TransactionEvent extends Event {
  type: 'transaction';
}

/** JSDoc */
export interface EventHint {
  event_id?: string;
  captureContext?: CaptureContext;
  syntheticException?: Error | null;
  originalException?: Error | string | null;
  attachments?: Attachment[];
  data?: any;
}
