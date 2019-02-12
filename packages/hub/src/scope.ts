import { Breadcrumb, SentryEvent, SentryEventHint, Severity, User } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils/misc';
import { assign, safeNormalize } from '@sentry/utils/object';

export type EventProcessor = (
  event: SentryEvent,
  hint?: SentryEventHint,
) => Promise<SentryEvent | null> | SentryEvent | null;

/**
 * Holds additional event information. {@link Scope.applyToEvent} will be
 * called by the client before an event will be sent.
 */
export class Scope {
  /** Flag if notifiying is happening. */
  protected notifyingListeners: boolean = false;

  /** Callback for client to receive scope changes. */
  protected scopeListeners: Array<(scope: Scope) => void> = [];

  /** Callback list that will be called after {@link applyToEvent}. */
  protected eventProcessors: EventProcessor[] = [];

  /** Array of breadcrumbs. */
  protected breadcrumbs: Breadcrumb[] = [];

  /** User */
  protected user: User = {};

  /** Tags */
  protected tags: { [key: string]: string } = {};

  /** Extra */
  protected extra: { [key: string]: any } = {};

  /** Fingerprint */
  protected fingerprint?: string[];

  /** Severity */
  protected level?: Severity;

  /** Add internal on change listener. */
  public addScopeListener(callback: (scope: Scope) => void): void {
    this.scopeListeners.push(callback);
  }

  /** Add new event processor that will be called after {@link applyToEvent}. */
  public addEventProcessor(callback: EventProcessor): Scope {
    this.eventProcessors.push(callback);
    return this;
  }

  /**
   * This will be called on every set call.
   */
  protected notifyScopeListeners(): void {
    if (!this.notifyingListeners) {
      this.notifyingListeners = true;
      setTimeout(() => {
        this.scopeListeners.forEach(callback => {
          callback(this);
        });
        this.notifyingListeners = false;
      });
    }
  }

  /**
   * This will be called after {@link applyToEvent} is finished.
   */
  protected async notifyEventProcessors(event: SentryEvent, hint?: SentryEventHint): Promise<SentryEvent | null> {
    let processedEvent: SentryEvent | null = event;
    for (const processor of [...getGlobalEventProcessors(), ...this.eventProcessors]) {
      try {
        processedEvent = await processor({ ...processedEvent }, hint);
        if (processedEvent === null) {
          return null;
        }
      } catch (e) {
        continue;
      }
    }
    return processedEvent;
  }

  /**
   * Updates user context information for future events.
   * @param user User context object to be set in the current context.
   */
  public setUser(user: User): Scope {
    this.user = safeNormalize(user);
    this.notifyScopeListeners();
    return this;
  }

  /**
   * Updates tags context information for future events.
   * @param tags Tags context object to merge into current context.
   */
  public setTag(key: string, value: string): Scope {
    this.tags = { ...this.tags, [key]: safeNormalize(value) };
    this.notifyScopeListeners();
    return this;
  }

  /**
   * Updates extra context information for future events.
   * @param extra context object to merge into current context.
   */
  public setExtra(key: string, extra: any): Scope {
    this.extra = { ...this.extra, [key]: safeNormalize(extra) };
    this.notifyScopeListeners();
    return this;
  }

  /**
   * Sets the fingerprint on the scope to send with the events.
   * @param fingerprint string[] to group events in Sentry.
   */
  public setFingerprint(fingerprint: string[]): Scope {
    this.fingerprint = safeNormalize(fingerprint);
    this.notifyScopeListeners();
    return this;
  }

  /**
   * Sets the level on the scope for future events.
   * @param level string {@link Severity}
   */
  public setLevel(level: Severity): Scope {
    this.level = safeNormalize(level);
    this.notifyScopeListeners();
    return this;
  }

  /**
   * Inherit values from the parent scope.
   * @param scope to clone.
   */
  public static clone(scope?: Scope): Scope {
    const newScope = new Scope();
    assign(newScope, scope, {
      scopeListeners: [],
    });
    if (scope) {
      newScope.extra = assign(scope.extra);
      newScope.tags = assign(scope.tags) as any;
      newScope.breadcrumbs = [...scope.breadcrumbs];
      newScope.eventProcessors = [...scope.eventProcessors];
    }
    return newScope;
  }

  /** Clears the current scope and resets its properties. */
  public clear(): void {
    this.breadcrumbs = [];
    this.tags = {};
    this.extra = {};
    this.user = {};
    this.level = undefined;
    this.fingerprint = undefined;
    this.notifyScopeListeners();
  }

  /**
   * Sets the breadcrumbs in the scope
   * @param breadcrumbs Breadcrumb
   * @param maxBreadcrumbs number of max breadcrumbs to merged into event.
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): void {
    this.breadcrumbs =
      maxBreadcrumbs !== undefined && maxBreadcrumbs >= 0
        ? [...this.breadcrumbs, safeNormalize(breadcrumb)].slice(-maxBreadcrumbs)
        : [...this.breadcrumbs, safeNormalize(breadcrumb)];
    this.notifyScopeListeners();
  }

  /**
   * Applies fingerprint from the scope to the event if there's one,
   * uses message if there's one instead or get rid of empty fingerprint
   */
  private applyFingerprint(event: SentryEvent): void {
    // Make sure it's an array first and we actually have something in place
    event.fingerprint = event.fingerprint
      ? Array.isArray(event.fingerprint)
        ? event.fingerprint
        : [event.fingerprint]
      : [];

    // If we have something on the scope, then merge it with event
    if (this.fingerprint) {
      event.fingerprint = event.fingerprint.concat(this.fingerprint);
    } else if (event.message) {
      // If not, but we have message, use it instead
      event.fingerprint = event.fingerprint.concat(event.message);
    }

    // If we have no data at all, remove empty array default
    if (event.fingerprint && !event.fingerprint.length) {
      delete event.fingerprint;
    }
  }

  /**
   * Applies the current context and fingerprint to the event.
   * Note that breadcrumbs will be added by the client.
   * Also if the event has already breadcrumbs on it, we do not merge them.
   * @param event SentryEvent
   * @param hint May contain additional informartion about the original exception.
   * @param maxBreadcrumbs number of max breadcrumbs to merged into event.
   */
  public async applyToEvent(
    event: SentryEvent,
    hint?: SentryEventHint,
    maxBreadcrumbs?: number,
  ): Promise<SentryEvent | null> {
    if (this.extra && Object.keys(this.extra).length) {
      event.extra = { ...this.extra, ...event.extra };
    }
    if (this.tags && Object.keys(this.tags).length) {
      event.tags = { ...this.tags, ...event.tags };
    }
    if (this.user && Object.keys(this.user).length) {
      event.user = { ...this.user, ...event.user };
    }
    if (this.level) {
      event.level = this.level;
    }

    this.applyFingerprint(event);

    const hasNoBreadcrumbs = !event.breadcrumbs || event.breadcrumbs.length === 0;
    if (hasNoBreadcrumbs && this.breadcrumbs.length > 0) {
      event.breadcrumbs =
        maxBreadcrumbs !== undefined && maxBreadcrumbs >= 0
          ? this.breadcrumbs.slice(-maxBreadcrumbs)
          : this.breadcrumbs;
    }

    return this.notifyEventProcessors(event, hint);
  }
}

/**
 * Retruns the global event processors.
 */
function getGlobalEventProcessors(): EventProcessor[] {
  const global: any = getGlobalObject();
  global.__SENTRY__ = global.__SENTRY__ || {};
  global.__SENTRY__.globalEventProcessors = global.__SENTRY__.globalEventProcessors || [];
  return global.__SENTRY__.globalEventProcessors;
}

/**
 * Add a EventProcessor to be kept globally.
 * @param callback EventProcessor to add
 */
export function addGlobalEventProcessor(callback: EventProcessor): void {
  getGlobalEventProcessors().push(callback);
}
