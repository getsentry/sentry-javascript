/* eslint-disable @typescript-eslint/naming-convention */

type blockClass = string | RegExp;
type maskTextClass = string | RegExp;

/** Duplicate this from @sentry-internal/rrweb so we can export this as well. */
export enum EventType {
  DomContentLoaded = 0,
  Load = 1,
  FullSnapshot = 2,
  IncrementalSnapshot = 3,
  Meta = 4,
  Custom = 5,
  Plugin = 6,
}

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
 * we specifically use in the SDK. Users can specify additional properties, hence we add the
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

export interface Mirror {
  getId: (n: Node) => number;
};
