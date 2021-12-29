import { Transaction } from '.';
import { Breadcrumb } from './breadcrumb';
import { Context, Contexts } from './context';
import { Event, EventHint } from './event';
import { EventProcessor } from './eventprocessor';
import { Extra, Extras } from './extra';
import { Primitive } from './misc';
import { RequestSession, Session } from './session';
import { SeverityLevel } from './severity';
import { Span } from './span';
import { User } from './user';

/** JSDocs */
export type CaptureContext = Scope | Partial<ScopeContext> | ((scope: Scope) => Scope);

/** JSDocs */
export interface ScopeContext {
  user: User;
  level: SeverityLevel;
  extra: Extras;
  contexts: Contexts;
  tags: { [key: string]: Primitive };
  fingerprint: string[];
  requestSession: RequestSession;
}

export type ScopeData = {
  breadcrumbs: Breadcrumb[];
  tags: { [key: string]: Primitive };
  extras: Extras;
  contexts: Contexts;
  fingerprint?: string[];
  user?: User;
  level?: SeverityLevel;
  transactionName?: string;
  span?: Span;
  session?: Session;
  requestSession?: RequestSession;
};

/**
 * Holds additional event information. {@link Scope.applyToEvent} will be
 * called by the client before an event will be sent.
 */
export interface Scope {
  /**  */
  addScopeListener(listener: (scope: Scope) => void): this;

  /** Add new event processor that will be called after {@link applyToEvent}. */
  addEventProcessor(callback: EventProcessor): this;

  /** @TODO */
  applyToEvent(event: Event, hint?: EventHint): PromiseLike<Event | null>;
  clone(): Scope;

  addTag(key: string, value: Primitive): Scope;
  addExtra(key: string, value: Extra): Scope;
  addContext(key: string, value: Context | null): Scope;

  getProcessors(): EventProcessor[];
  getTag(key: string): Primitive | undefined;
  getExtra(key: string): Extra | undefined;
  getTransaction(): Transaction | undefined;
  getContext(key: string): Context | undefined;

  setScopeData<K extends keyof Omit<ScopeData, 'breadcrumbs'>>(key: string, value: ScopeData[K]): Scope;
  getScopeData<K extends keyof ScopeData>(key: K): ScopeData[K];

  /**
   * Updates the scope with provided data. Can work in three variations:
   * - plain object containing updatable attributes
   * - Scope instance that'll extract the attributes from
   * - callback function that'll receive the current scope as an argument and allow for modifications
   * @param captureContext scope modifier to be used
   */
  update(captureContext?: CaptureContext): this;

  /** Clears the current scope and resets its properties. */
  clear(): this;

  /**
   * Sets the breadcrumbs in the scope
   * @param breadcrumbs Breadcrumb
   * @param maxBreadcrumbs number of max breadcrumbs to merged into event.
   */
  addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): this;

  /**
   * Clears all currently set Breadcrumbs.
   */
  clearBreadcrumbs(): this;
}
