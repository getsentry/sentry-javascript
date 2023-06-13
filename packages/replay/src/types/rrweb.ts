/* eslint-disable @typescript-eslint/naming-convention */

import type { EventType } from '@sentry-internal/rrweb';

type blockClass = string | RegExp;
type maskTextClass = string | RegExp;

/**
 * This is a partial copy of rrweb's eventWithTime type which only contains the properties
 * we specifcally need in the SDK.
 */
export type eventWithTime = {
  type: EventType;
  data: unknown;
  timestamp: number;
  delay?: number;
};

/**
 * This is a partial copy of rrweb's recording options which only contains the properties
 * we specifically us in the SDK. Users can specify additional properties, hence we add the
 * Record<string, unknown> union type.
 */
export type recordOptions = {
  maskAllText?: boolean;
  maskAllInputs?: boolean;
  blockClass?: blockClass;
  ignoreClass?: string;
  maskTextClass?: maskTextClass;
  maskTextSelector?: string;
  blockSelector?: string;
  maskInputOptions?: Record<string, boolean>;
} & Record<string, unknown>;
