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
 * we specifically need in the SDK.
 */
export type ReplayEventWithTime = {
  type: ReplayEventType;
  data: unknown;
  timestamp: number;
  delay?: number;
};

/**
 * This is a partial copy of rrweb's recording options which only contains the properties
 * we specifically use in the SDK. Users can specify additional properties, hence we add the
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

export interface CanvasManagerInterface {
  reset(): void;
  freeze(): void;
  unfreeze(): void;
  lock(): void;
  unlock(): void;
  snapshot(): void;
  addWindow(win: typeof globalThis & Window): void;
  addShadowRoot(shadowRoot: ShadowRoot): void;
  resetShadowRoots(): void;
}

export interface CanvasManagerOptions {
  recordCanvas: boolean;
  enableManualSnapshot?: boolean;
  blockClass: string | RegExp;
  blockSelector: string | null;
  unblockSelector: string | null;
  sampling?: 'all' | number;
  dataURLOptions: Partial<{
    type: string;
    quality: number;
  }>;
  mutationCb: (p: any) => void;
  win: typeof globalThis & Window;
  mirror: any;
}
