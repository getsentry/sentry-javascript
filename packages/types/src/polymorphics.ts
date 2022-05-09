/**
 * Event-like interface that's usable in browser and node.
 *
 * Property availability taken from https://developer.mozilla.org/en-US/docs/Web/API/Event#browser_compatibility
 */
export interface PolymorphicEvent {
  [key: string]: unknown;
  readonly type: string;
  readonly target?: unknown;
  readonly currentTarget?: unknown;
}
