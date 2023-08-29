type ClassOption = string | RegExp;

/** Duplicate this from @sentry-internal/rrweb so we can export this as well. */
export const ReplayEventTypeDomContentLoaded = 0;
export const ReplayEventTypeLoad = 1;
export const ReplayEventTypeFullSnapshot = 2;
export const ReplayEventTypeIncrementalSnapshot = 3;
export const ReplayEventTypeMeta = 4;
export const ReplayEventTypeCustom = 5;
export const ReplayEventTypePlugin = 6;

export type ReplayEventType =
  | typeof ReplayEventTypeDomContentLoaded
  | typeof ReplayEventTypeLoad
  | typeof ReplayEventTypeFullSnapshot
  | typeof ReplayEventTypeIncrementalSnapshot
  | typeof ReplayEventTypeMeta
  | typeof ReplayEventTypeCustom
  | typeof ReplayEventTypePlugin;

/**
 * This is a partial copy of rrweb's eventWithTime type which only contains the properties
 * we specifcally need in the SDK.
 */
export type ReplayEventWithTime = {
  type: ReplayEventType;
  data: unknown;
  timestamp: number;
  delay?: number;
};

/**
 * This is a partial copy of rrweb's recording options which only contains the properties
 * we specifically us in the SDK. Users can specify additional properties, hence we add the
 * Record<string, unknown> union type.
 */
export type RrwebRecordOptions = {
  maskAllText?: boolean;
  maskAllInputs?: boolean;
  blockClass?: ClassOption;
  ignoreClass?: string;
  maskTextClass?: ClassOption;
  maskTextSelector?: string;
  blockSelector?: string;
  maskInputOptions?: Record<string, boolean>;
} & Record<string, unknown>;
