import type {
  Attachment,
  Breadcrumb,
  Contexts,
  Event,
  EventHint,
  EventProcessor,
  Extras,
  Hub,
  Integration,
  Primitive,
  PropagationContext,
  Scope as BaseScope,
  Severity,
  SeverityLevel,
  User,
} from '@sentry/types';

export interface ScopeData {
  eventProcessors: EventProcessor[];
  breadcrumbs: Breadcrumb[];
  user: User;
  tags: { [key: string]: Primitive };
  extra: Extras;
  contexts: Contexts;
  attachments: Attachment[];
  propagationContext: PropagationContext;
  sdkProcessingMetadata: { [key: string]: unknown };
  fingerprint: string[];
  level?: SeverityLevel;
}

export interface Scope extends BaseScope {
  // @ts-expect-error typeof this is what we want here
  isolationScope: typeof this | undefined;
  // @ts-expect-error typeof this is what we want here
  clone(scope?: Scope): typeof this;
  captureException(exception: unknown, hint?: EventHint): string;
  captureMessage(
    message: string,
    // eslint-disable-next-line deprecation/deprecation
    level?: Severity | SeverityLevel,
    hint?: EventHint,
  ): string;
  captureEvent(event: Event, hint?: EventHint): string;
  lastEventId(): string | undefined;
  getScopeData(): ScopeData;
}

export interface CurrentScopes {
  scope: Scope;
  isolationScope: Scope;
}

/**
 * Strategy used to track async context.
 */
export interface AsyncContextStrategy {
  /**
   * Gets the current async context. Returns undefined if there is no current async context.
   */
  getScopes: () => CurrentScopes | undefined;

  /** This is here for legacy reasons. */
  getCurrentHub: () => Hub;

  /**
   * Runs the supplied callback in its own async context.
   */
  runWithAsyncContext<T>(callback: () => T): T;
}

export interface SentryCarrier {
  scopes?: CurrentScopes;
  acs?: AsyncContextStrategy;

  // hub is here for legacy reasons
  hub?: Hub;

  extensions?: {
    /** Extension methods for the hub, which are bound to the current Hub instance */
    // eslint-disable-next-line @typescript-eslint/ban-types
    [key: string]: Function;
  };

  integrations?: Integration[];
}
