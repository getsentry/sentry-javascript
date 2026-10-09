import type { Client, Span, SpanContextData, SpanLink } from '@sentry/core';
import { debug, defineIntegration, hasSpansEnabled, startInactiveSpan } from '@sentry/core';
import type { CallEvent, CallLive } from '@solidjs/web';
import { OBSERVE } from 'solid-js';
import type {
  AttributionOptions,
  ChangeOrigin,
  HoldEvent,
  InteractionEvent,
  NavigationEvent,
} from 'solid-js/attribution';
import { attribution } from 'solid-js/attribution';
import type { DiagnosticsOptions } from '../common/diagnostics';
import { captureDiagnostic } from '../common/diagnostics';
import { describeOrigin, describeTarget } from '../common/target';
import { epochSeconds, round } from '../common/time';
import { DEBUG_BUILD } from '../debug-build';
import { drivesNavigationSpans } from './browser-tracing';
import { browserNavigationSpan, holdSpan, nameInitialRoute, navigationSpan, ORIGIN } from './navigation';
import { callSpan, frameSpan } from './records';

const INTEGRATION_NAME = 'SolidTracing';

let uninstall: (() => void) | undefined;

export interface SolidTracingOptions {
  /**
   * Options for Solid's attribution engine (`attribution.enable`). `log` is
   * always off — the SDK is the consumer, not the console.
   */
  attribution?: Omit<AttributionOptions, 'log'>;
  /** Report the runtime's diagnostics as issues (default on, `warn` and up). `false` disables. */
  diagnostics?: DiagnosticsOptions | false;
  /**
   * Spans for the runtime's own records — server-function calls and applied
   * frame streams (default on).
   */
  records?: boolean;
  /**
   * Keep the caption of the control an interaction hit (`button#next "Next
   * →"`) in span names and attributes. Off by default: the engine is asked
   * for `values: "none"`, so records carry the element alone (`button#next`)
   * and no value previews. On, the engine's `"labels"` level applies — the
   * caption of a `button` or an `a` is kept, the text of anything else (a
   * `td`, a `div`) is still dropped. Scrubbed where the record is built, so
   * nothing in the SDK ever holds the text.
   */
  targetText?: boolean;
}

/**
 * Traces from Solid 2's observe tier: one root span per user interaction
 * with its holds and server-function calls as children; the runtime's
 * diagnostics as issues; and the router's navigation records as the route
 * names of the browser SDK's `pageload` and `navigation` spans. Records
 * arrive settled, with an absolute `at` and durations, so every span is
 * built retroactively with explicit start and end times.
 *
 * Navigations: the record of the route the document arrived on
 * (`NavigationEvent.initial`) renames the active `pageload` span to the
 * route pattern (source `route`, params as attributes). Beside
 * `solidBrowserTracingIntegration`, every later record starts the
 * `navigation` span the browser SDK would otherwise have started on
 * `pushState` — named by the route, from the write that requested it to the
 * settle — with the navigation's holds as children; the interaction that
 * performed it links to it rather than containing it. With the plain
 * `browserTracingIntegration`, or none, a navigation record is a span of its
 * own: a child of its interaction, or a root when no interaction claims it.
 *
 * Inert on a build without `OBSERVE` (production without the `observe`
 * condition): errors still report through `solidErrorsIntegration`.
 */
export const solidTracingIntegration = defineIntegration((options: SolidTracingOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      if (OBSERVE === undefined) {
        DEBUG_BUILD && debug.warn('solidTracingIntegration: solid-js is not an observe build; no traces');
        return;
      }
      // No tracing, no hold: a client that will never start a span should
      // not keep the engine recording on its behalf.
      if (!hasSpansEnabled(client.getOptions())) {
        DEBUG_BUILD && debug.log('solidTracingIntegration: tracing is not enabled; the attribution engine is not held');
        return;
      }
      // Solid's channels are process-wide, not per client: a second `init`
      // (tests, HMR) replaces the previous subscriptions rather than stacking.
      uninstall?.();
      const tracer = new Tracer(client);
      // `enable()` is a hold on a shared engine, not a switch: Solid's own
      // Performance-panel tracks, a diagnostics capture and this SDK coexist,
      // options combine by the most demanding request per key (`log: false`
      // asks for nothing; it silences no one), and the engine stays up while
      // any hold remains. The returned release is this SDK's — `disable()`
      // would tear the engine down for every consumer.
      // `values` is the least-permissive-wins key: asking for "none" here
      // holds even beside a dev console that asked for "full". No `rerun`
      // subscription — the engine builds re-run records only for an
      // audience, and the interaction record's `runs`/`runMs` are what the
      // span needs; a records-only consumer stays a lean one.
      const release = attribution.enable({
        historyLimit: 200,
        ...options.attribution,
        values: options.targetText === true ? 'labels' : 'none',
        log: false,
      });
      const off = [
        release,
        OBSERVE.records.subscribe('interaction', event => queueMicrotask(() => tracer.interaction(event))),
        OBSERVE.records.subscribe('navigation', event => {
          // The document's own arrival is nobody's interaction; a later
          // record an interaction claims arrives again inside that
          // interaction's record, and is handled there.
          if (event.initial === true) queueMicrotask(() => tracer.initialNavigation(event));
          else if (event.interaction === undefined) queueMicrotask(() => tracer.orphanNavigation(event));
        }),
        OBSERVE.records.subscribe('hold', event => {
          if (event.interaction === undefined && event.origin?.kind !== 'navigation') {
            queueMicrotask(() => holdSpan(event, null));
          }
        }),
      ];
      if (options.diagnostics !== false) {
        const diagnosticsOptions = options.diagnostics;
        off.push(
          OBSERVE.diagnostics.subscribe(event => queueMicrotask(() => captureDiagnostic(event, diagnosticsOptions))),
        );
      }
      if (options.records !== false) {
        off.push(
          OBSERVE.records.subscribe('call', (event, live) => {
            if (tracer.claimCall(event, live)) return;
            // No frame claims it: a child of the active span — the `pageload`
            // while it runs, as the browser SDK parents a fetch — else a root.
            queueMicrotask(() => callSpan(event, live, undefined));
          }),
          OBSERVE.records.subscribe('frame', (event, live) => {
            if (event.side === 'client') queueMicrotask(() => frameSpan(event, live));
          }),
        );
      }
      uninstall = () => {
        for (const fn of off) fn();
        uninstall = undefined;
      };
    },
  };
});

interface RecentInteraction {
  at: number;
  until: number;
  context: SpanContextData;
}
const RECENT_LIMIT = 50;

class Tracer {
  private readonly _client: Client;
  private readonly _settled: WeakSet<ChangeOrigin>;
  /** The root span each settled interaction became — the parent for work it caused after its window closed. */
  private readonly _spans: WeakMap<ChangeOrigin, Span>;
  /** Server-function calls dispatched under an interaction still open, awaiting its segment. */
  private readonly _calls: WeakMap<ChangeOrigin, Array<{ event: CallEvent; live: CallLive }>>;
  /** Settled interactions kept for the time join, newest last. */
  private readonly _recent: RecentInteraction[];
  /** Navigations whose record arrived — with the span each became, when it became one. */
  private readonly _navigationsSettled: WeakSet<ChangeOrigin>;
  private readonly _navigationSpans: WeakMap<ChangeOrigin, Span>;
  /** Server-function calls dispatched under a navigation still open, awaiting its span. */
  private readonly _navigationCalls: WeakMap<ChangeOrigin, Array<{ event: CallEvent; live: CallLive }>>;

  public constructor(client: Client) {
    this._client = client;
    this._settled = new WeakSet();
    this._spans = new WeakMap();
    this._calls = new WeakMap();
    this._recent = [];
    this._navigationsSettled = new WeakSet();
    this._navigationSpans = new WeakMap();
    this._navigationCalls = new WeakMap();
  }

  /**
   * A navigation record as the browser `navigation` span, when
   * `solidBrowserTracingIntegration` handed those to the records and the
   * span was started for this client; `undefined` otherwise.
   */
  private _browserNavigation(nav: NavigationEvent, links?: SpanLink[]): Span | undefined {
    if (!drivesNavigationSpans(this._client)) return undefined;
    const span = browserNavigationSpan(this._client, nav, links, s => this._paintNavigationCalls(nav, s));
    if (span !== undefined) this._settleNavigation(nav, span);
    return span;
  }

  /** A navigation record as a span of its own under `parent` — no browser span to be. */
  private _ownNavigation(nav: NavigationEvent, parent: Span | null, links?: SpanLink[]): Span {
    const span = navigationSpan(nav, parent, links, s => this._paintNavigationCalls(nav, s));
    this._settleNavigation(nav, span);
    return span;
  }

  /** `links` join a navigation to an interaction it cannot be a child of — the browser span starts a trace of its own. */
  private _navigation(nav: NavigationEvent, parent: Span | null, links?: SpanLink[]): Span {
    return this._browserNavigation(nav, links) ?? this._ownNavigation(nav, parent, links);
  }

  private _paintNavigationCalls(nav: NavigationEvent, span: Span): void {
    const calls = this._navigationCalls.get(nav.origin);
    if (calls === undefined) return;
    this._navigationCalls.delete(nav.origin);
    for (const call of calls) callSpan(call.event, call.live, span);
  }

  private _settleNavigation(nav: NavigationEvent, span: Span | undefined): void {
    this._navigationsSettled.add(nav.origin);
    if (span !== undefined) this._navigationSpans.set(nav.origin, span);
  }

  /** The route the document arrived on: names the `pageload`, is no navigation. */
  public initialNavigation(nav: NavigationEvent): void {
    this._settleNavigation(nav, undefined);
    nameInitialRoute(nav);
  }

  /**
   * A call is claimed by the frame its `origin` names, joined by the
   * engine's object identity rather than by time. A call a navigation
   * caused — a `createAsync` calling the server on the route's write — is
   * the navigation's: held for its span while the navigation is open, a
   * child of that span at once when it has settled. A call under an
   * interaction is the interaction's the same way; made after the
   * interaction settled — the shape of `onClick={() => { save().then(set) }}`,
   * where the handler's synchronous window closes long before the call
   * lands — it becomes a child of that span, marked `after_settle`. A call
   * with no frame at all is left to the caller: a child of whatever span is
   * active (the `pageload`, for the calls a load makes), else a root.
   */
  public claimCall(event: CallEvent, live: CallLive): boolean {
    const origin = event.origin;
    if (origin === undefined) return false;
    if (origin.kind === 'navigation') {
      const navigation = this._navigationSpans.get(origin);
      if (navigation !== undefined) {
        queueMicrotask(() => callSpan(event, live, navigation, true));
        return true;
      }
      if (!this._navigationsSettled.has(origin)) {
        let calls = this._navigationCalls.get(origin);
        if (calls === undefined) this._navigationCalls.set(origin, (calls = []));
        calls.push({ event, live });
        return true;
      }
      // A settled navigation that became no span — the document's arrival —
      // leaves the call to its interaction, if any, else to the pageload.
    }
    const interaction = origin.kind === 'interaction' ? origin : origin.interaction;
    if (interaction === undefined) return false;
    if (this._settled.has(interaction)) {
      const parent = this._spans.get(interaction);
      if (parent === undefined) return false;
      queueMicrotask(() => callSpan(event, live, parent, true));
      return true;
    }
    let calls = this._calls.get(interaction);
    if (calls === undefined) this._calls.set(interaction, (calls = []));
    calls.push({ event, live });
    return true;
  }

  public interaction(event: InteractionEvent): void {
    const { origin } = event;
    this._settled.add(origin);
    // `at` is the browser event's own timestamp (the same instant Chrome's
    // INP entry starts at), so the span covers the input delay the browser
    // counts first; the handler itself ran from `at + inputDelayMs`.
    const inputDelayMs = event.inputDelayMs ?? 0;
    const handlerEnd = event.at + inputDelayMs + event.handlerMs;
    // The navigations first, when they are browser navigation spans: each
    // starts a new trace, and the interaction's own span then opens in the
    // trace of the navigation it performed rather than in one of its own.
    // Nothing in `navigations` is the document's arrival (`initial`).
    const browserNavigations: Span[] = [];
    const ownNavigations: NavigationEvent[] = [];
    const underNavigation = new Set<HoldEvent>();
    for (const nav of event.navigations) {
      if (nav.hold !== undefined) underNavigation.add(nav.hold);
      const browserSpan = this._browserNavigation(nav);
      if (browserSpan !== undefined) browserNavigations.push(browserSpan);
      else ownNavigations.push(nav);
    }
    const span = startInactiveSpan({
      name: describeOrigin(origin),
      op: `ui.interaction.${event.name}`,
      parentSpan: null,
      startTime: epochSeconds(event.at),
      attributes: {
        'solid.interaction.type': event.name,
        'solid.interaction.target': describeTarget(event.target),
        'solid.interaction.outcome': event.outcome,
        'solid.interaction.inputDelayMs': event.inputDelayMs === undefined ? undefined : round(event.inputDelayMs),
        'solid.interaction.handlerMs': round(event.handlerMs),
        'solid.interaction.writes': event.writes,
        'solid.reruns': event.runs,
        'solid.created': event.created,
        'solid.runMs': round(event.runMs),
        'solid.holds': event.holds.length,
        'solid.navigations': event.navigations.length,
        'sentry.origin': ORIGIN,
      },
    });
    // A navigation that became the browser's span is a root of its own: the
    // click links to it — the causal fact, kept without a guessed parent.
    for (const browserSpan of browserNavigations) {
      span.addLink({ context: browserSpan.spanContext(), attributes: { 'solid.link': 'navigation' } });
    }
    for (const nav of ownNavigations) this._ownNavigation(nav, span);
    for (const hold of event.holds) if (!underNavigation.has(hold)) holdSpan(hold, span);
    const calls = this._calls.get(origin);
    if (calls !== undefined) {
      this._calls.delete(origin);
      for (const call of calls) callSpan(call.event, call.live, span);
    }
    span.end(epochSeconds(event.settledMs === undefined ? handlerEnd : event.at + event.settledMs));
    this._spans.set(origin, span);
    this._recent.push({ at: event.at, until: handlerEnd, context: span.spanContext() });
    if (this._recent.length > RECENT_LIMIT) this._recent.shift();
  }

  /**
   * A navigation the engine could not stamp with an interaction: a router
   * that publishes in a later task, or a programmatic `navigate()`. If its
   * request time sits inside a settled interaction's handler window, that
   * click is its cause — the two traces are linked rather than a parent guessed.
   */
  public orphanNavigation(nav: NavigationEvent): void {
    let cause: RecentInteraction | undefined;
    for (let i = this._recent.length - 1; i >= 0 && cause === undefined; i--) {
      const r = this._recent[i]!;
      if (nav.at >= r.at && nav.at <= r.until) cause = r;
    }
    const links: SpanLink[] | undefined = cause
      ? [{ context: cause.context, attributes: { 'solid.link': 'interaction-by-time' } }]
      : undefined;
    this._navigation(nav, null, links);
  }
}
