import { Breadcrumb, Event, EventHint, EventProcessor, Scope as ScopeInterface, Severity, User } from '@sentry/types';
import { isThenable } from '@sentry/utils/is';
import { getGlobalObject } from '@sentry/utils/misc';
import { normalize } from '@sentry/utils/object';
import { SyncPromise } from '@sentry/utils/syncpromise';

/**
 * Holds additional event information. {@link Scope.applyToEvent} will be
 * called by the client before an event will be sent.
 */
export class Scope implements ScopeInterface {
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

  /**
   * @inheritdoc
   */
  public addEventProcessor(callback: EventProcessor): Scope {
    this.eventProcessors.push(callback);
    return this;
  }

  /**
   * This will be called after {@link applyToEvent} is finished.
   */
  protected notifyEventProcessors(
    processors: EventProcessor[],
    event: Event | null,
    hint?: EventHint,
    index: number = 0,
  ): SyncPromise<Event | null> {
    return new SyncPromise<Event | null>((resolve, reject) => {
      const processor = processors[index];
      // tslint:disable-next-line:strict-type-predicates
      if (event === null || typeof processor !== 'function') {
        resolve(event);
      } else {
        const result = processor({ ...event }, hint) as Event | null;
        if (isThenable(result)) {
          (result as Promise<Event | null>)
            .then(final => this.notifyEventProcessors(processors, final, hint, index + 1).then(resolve))
            .catch(reject);
        } else {
          this.notifyEventProcessors(processors, result, hint, index + 1)
            .then(resolve)
            .catch(reject);
        }
      }
    });
  }

  /**
   * @inheritdoc
   */
  public setUser(user: User): Scope {
    this.user = normalize(user);
    return this;
  }

  /**
   * @inheritdoc
   */
  public setTag(key: string, value: string): Scope {
    this.tags = { ...this.tags, [key]: normalize(value) };
    return this;
  }

  /**
   * @inheritdoc
   */
  public setExtra(key: string, extra: any): Scope {
    this.extra = { ...this.extra, [key]: normalize(extra) };
    return this;
  }

  /**
   * @inheritdoc
   */
  public setFingerprint(fingerprint: string[]): Scope {
    this.fingerprint = normalize(fingerprint);
    return this;
  }

  /**
   * @inheritdoc
   */
  public setLevel(level: Severity): Scope {
    this.level = normalize(level);
    return this;
  }

  /**
   * Inherit values from the parent scope.
   * @param scope to clone.
   */
  public static clone(scope?: Scope): Scope {
    const newScope = new Scope();
    Object.assign(newScope, scope, {
      scopeListeners: [],
    });
    if (scope) {
      newScope.extra = { ...scope.extra };
      newScope.tags = { ...scope.tags };
      newScope.breadcrumbs = [...scope.breadcrumbs];
      newScope.eventProcessors = [...scope.eventProcessors];
    }
    return newScope;
  }

  /**
   * @inheritdoc
   */
  public clear(): void {
    this.breadcrumbs = [];
    this.tags = {};
    this.extra = {};
    this.user = {};
    this.level = undefined;
    this.fingerprint = undefined;
  }

  /**
   * @inheritdoc
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): void {
    this.breadcrumbs =
      maxBreadcrumbs !== undefined && maxBreadcrumbs >= 0
        ? [...this.breadcrumbs, normalize(breadcrumb)].slice(-maxBreadcrumbs)
        : [...this.breadcrumbs, normalize(breadcrumb)];
  }

  /**
   * Applies fingerprint from the scope to the event if there's one,
   * uses message if there's one instead or get rid of empty fingerprint
   */
  private applyFingerprint(event: Event): void {
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
   * @param event Event
   * @param hint May contain additional informartion about the original exception.
   * @param maxBreadcrumbs number of max breadcrumbs to merged into event.
   * @hidden
   */
  public applyToEvent(event: Event, hint?: EventHint): SyncPromise<Event | null> {
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
      event.breadcrumbs = this.breadcrumbs;
    }

    return this.notifyEventProcessors([...getGlobalEventProcessors(), ...this.eventProcessors], event, hint);
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
