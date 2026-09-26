import type { Span, SpanContextData, SpanLink } from '@sentry/core';
import { debug, defineIntegration, startInactiveSpan } from '@sentry/core';
import type { CallEvent, CallLive } from '@solidjs/web';
import { OBSERVE } from 'solid-js';
import type {
  AttributionOptions,
  ChangeOrigin,
  HoldEvent,
  InteractionEvent,
  NavigationEvent,
  RerunEvent,
} from 'solid-js/attribution';
import { attribution } from 'solid-js/attribution';
import type { DiagnosticsOptions } from '../common/diagnostics';
import { captureDiagnostic } from '../common/diagnostics';
import { describeOrigin, describeTarget } from '../common/target';
import { epochSeconds, round } from '../common/time';
import { DEBUG_BUILD } from '../debug-build';
import { callSpan, frameSpan } from './records';

const INTEGRATION_NAME = 'SolidTracing';
const ORIGIN = 'auto.ui.solid.attribution';

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
   * Keep the element text Solid puts in an interaction's target
   * (`button#next "Next →"`, up to 30 characters) in span names and
   * attributes. Off by default — the text of a `<td>` a user clicked is user
   * data; the element alone (`button#next`) is kept either way.
   */
  targetText?: boolean;
}

/**
 * Traces from Solid 2's observe tier: one root span per user interaction
 * with its navigations, holds and server-function calls as children; a
 * navigation or hold no interaction claims as a root span of its own; the
 * runtime's diagnostics as issues. Records arrive settled, with an absolute
 * `at` and durations, so every span is built retroactively with explicit
 * start and end times. Inert on a build without `OBSERVE` (production
 * without the `observe` condition): errors still report through
 * `solidErrorsIntegration`.
 */
export const solidTracingIntegration = defineIntegration((options: SolidTracingOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      if (OBSERVE === undefined) {
        DEBUG_BUILD && debug.warn('solidTracingIntegration: solid-js is not an observe build; no traces');
        return;
      }
      // Solid's channels are process-wide, not per client: a second `init`
      // (tests, HMR) replaces the previous subscriptions rather than stacking.
      uninstall?.();
      const tracer = new Tracer(options.targetText === true);
      attribution.enable({ historyLimit: 200, ...options.attribution, log: false });
      const off = [
        attribution.subscribe('rerun', event => tracer.rerun(event)),
        attribution.subscribe('interaction', event => queueMicrotask(() => tracer.interaction(event))),
        attribution.subscribe('navigation', event => {
          if (event.interaction === undefined) queueMicrotask(() => tracer.orphanNavigation(event));
        }),
        attribution.subscribe('hold', event => {
          if (event.interaction === undefined && event.origin?.kind !== 'navigation') {
            queueMicrotask(() => holdSpan(event, null, tracer.keepText));
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
            queueMicrotask(() => callSpan(event, live, null, tracer.keepText));
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

const isSilent = (hold: HoldEvent): boolean => hold.acknowledgements.length === 0 && hold.paintedDuringHold === 0;

function holdSpan(hold: HoldEvent, parent: Span | null, keepText: boolean): Span {
  const span = startInactiveSpan({
    name: `hold${hold.blockers.length ? ` waiting on ${hold.blockers.join(', ')}` : ''}`,
    op: 'solid.hold',
    parentSpan: parent,
    startTime: epochSeconds(hold.at),
    attributes: {
      'solid.hold.ms': round(hold.holdMs),
      'solid.hold.tailMs': round(hold.tailMs),
      'solid.hold.flushes': hold.flushes,
      'solid.hold.silent': isSilent(hold),
      'solid.hold.acknowledgedBy': hold.acknowledgements.map(a => `${a.kind}:${a.source}`),
      'solid.hold.readers': hold.acknowledgements.flatMap(a => (a.reader ? [a.reader.join(' › ')] : [])),
      'solid.hold.blockers': hold.blockers,
      'solid.hold.heldWrites': hold.heldWrites.map(w => w.name),
      'solid.hold.painted': hold.paintedDuringHold,
      'solid.hold.action': hold.action,
      'solid.hold.navigation': hold.origin ? describeOrigin(hold.origin, keepText) : undefined,
      'sentry.origin': ORIGIN,
    },
  });
  span.end(epochSeconds(hold.at + hold.holdMs));
  return span;
}

function navigationSpan(nav: NavigationEvent, parent: Span | null, keepText: boolean, links?: SpanLink[]): Span {
  const attributes: Record<string, string | number | boolean | string[] | undefined> = {
    'solid.navigation.to': nav.to,
    'solid.navigation.from': nav.from,
    'solid.navigation.outcome': nav.outcome,
    'solid.navigation.writes': nav.writes,
    'solid.navigation.redirects': nav.redirects?.map(h => h.to ?? h.name ?? '?'),
    'solid.navigation.silent': nav.hold !== undefined && isSilent(nav.hold),
    'sentry.origin': ORIGIN,
  };
  for (const [key, value] of Object.entries(nav.params ?? {})) {
    if (value !== undefined) attributes[`url.path.parameter.${key}`] = value;
  }
  const span = startInactiveSpan({
    name: nav.name ?? nav.to ?? 'navigation',
    op: 'navigation',
    parentSpan: parent,
    startTime: epochSeconds(nav.at),
    attributes,
    links,
  });
  if (nav.hold !== undefined) holdSpan(nav.hold, span, keepText);
  span.end(epochSeconds(nav.at + (nav.settledMs ?? 0)));
  return span;
}

interface RecentInteraction {
  at: number;
  until: number;
  context: SpanContextData;
}
const RECENT_LIMIT = 50;

class Tracer {
  /** Self-time per node name for each open interaction — the record has totals, not the breakdown. */
  private readonly _hot: WeakMap<ChangeOrigin, Map<string, number>>;
  private readonly _settled: WeakSet<ChangeOrigin>;
  /** The root span each settled interaction became — the parent for work it caused after its window closed. */
  private readonly _spans: WeakMap<ChangeOrigin, Span>;
  /** Server-function calls dispatched under an interaction still open, awaiting its segment. */
  private readonly _calls: WeakMap<ChangeOrigin, Array<{ event: CallEvent; live: CallLive }>>;
  /** Settled interactions kept for the time join, newest last. */
  private readonly _recent: RecentInteraction[];

  public constructor(public readonly keepText: boolean) {
    this._hot = new WeakMap();
    this._settled = new WeakSet();
    this._spans = new WeakMap();
    this._calls = new WeakMap();
    this._recent = [];
  }

  public rerun(event: RerunEvent): void {
    const origin = event.interaction;
    // Runs after settle (an async landing behind a Loading boundary) are the record's, not its wait.
    if (origin === undefined || this._settled.has(origin)) return;
    let hot = this._hot.get(origin);
    if (hot === undefined) this._hot.set(origin, (hot = new Map()));
    hot.set(event.nodeName, (hot.get(event.nodeName) ?? 0) + event.selfMs);
  }

  /**
   * A call whose `origin` is an interaction is the interaction's, joined by
   * the engine's object identity rather than by time. Made while the
   * interaction is still open, it is held for the interaction's span; made
   * after the interaction settled — the usual shape of `onClick={async () =>
   * set(await call())}`, where the handler's synchronous window closes long
   * before the call lands — it becomes a child of that span at once, marked
   * `after_settle`. Only a call with no interaction at all is a root span.
   */
  public claimCall(event: CallEvent, live: CallLive): boolean {
    const origin = event.origin;
    const interaction = origin === undefined ? undefined : origin.kind === 'interaction' ? origin : origin.interaction;
    if (interaction === undefined) return false;
    if (this._settled.has(interaction)) {
      const parent = this._spans.get(interaction);
      if (parent === undefined) return false;
      queueMicrotask(() => callSpan(event, live, parent, this.keepText, true));
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
    const span = startInactiveSpan({
      name: describeOrigin(origin, this.keepText),
      op: `ui.interaction.${event.name}`,
      parentSpan: null,
      startTime: epochSeconds(event.at),
      attributes: {
        'solid.interaction.type': event.name,
        'solid.interaction.target': describeTarget(event.target, this.keepText),
        'solid.interaction.outcome': event.outcome,
        'solid.interaction.handlerMs': round(event.handlerMs),
        'solid.interaction.writes': event.writes,
        'solid.reruns': event.runs,
        'solid.created': event.created,
        'solid.runMs': round(event.runMs),
        'solid.hot': this._hotList(origin),
        'solid.holds': event.holds.length,
        'solid.navigations': event.navigations.length,
        'sentry.origin': ORIGIN,
      },
    });
    const underNavigation = new Set<HoldEvent>();
    for (const nav of event.navigations) {
      if (nav.hold !== undefined) underNavigation.add(nav.hold);
      navigationSpan(nav, span, this.keepText);
    }
    for (const hold of event.holds) if (!underNavigation.has(hold)) holdSpan(hold, span, this.keepText);
    const calls = this._calls.get(origin);
    if (calls !== undefined) {
      this._calls.delete(origin);
      for (const call of calls) callSpan(call.event, call.live, span, this.keepText);
    }
    span.end(epochSeconds(event.at + (event.settledMs ?? event.handlerMs)));
    this._spans.set(origin, span);
    this._recent.push({ at: event.at, until: event.at + event.handlerMs, context: span.spanContext() });
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
    navigationSpan(nav, null, this.keepText, links);
  }

  private _hotList(origin: ChangeOrigin): string[] {
    const hot = this._hot.get(origin);
    this._hot.delete(origin);
    if (hot === undefined) return [];
    return [...hot]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, ms]) => `${name} ${ms.toFixed(2)}ms`);
  }
}
