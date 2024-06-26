import {
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getRootSpan,
  spanToJSON,
  startInactiveSpan,
} from '@sentry/core';
import type { Integration, SpanAttributes } from '@sentry/types';
import { browserPerformanceTimeOrigin, dropUndefinedKeys, htmlTreeAsString } from '@sentry/utils';
import {
  addInpInstrumentationHandler,
  addPerformanceInstrumentationHandler,
  isPerformanceEventTiming,
} from './instrument';
import { getBrowserPerformanceAPI, msToSec } from './utils';

// We only care about name here
interface PartialRouteInfo {
  name: string | undefined;
}

const LAST_INTERACTIONS: number[] = [];
const INTERACTIONS_ROUTE_MAP = new Map<number, string>();

/**
 * Start tracking INP webvital events.
 */
export function startTrackingINP(): () => void {
  const performance = getBrowserPerformanceAPI();
  if (performance && browserPerformanceTimeOrigin) {
    const inpCallback = _trackINP();

    return (): void => {
      inpCallback();
    };
  }

  return () => undefined;
}

const INP_ENTRY_MAP: Record<string, 'click' | 'hover' | 'drag' | 'press'> = {
  click: 'click',
  pointerdown: 'click',
  pointerup: 'click',
  mousedown: 'click',
  mouseup: 'click',
  touchstart: 'click',
  touchend: 'click',
  mouseover: 'hover',
  mouseout: 'hover',
  mouseenter: 'hover',
  mouseleave: 'hover',
  pointerover: 'hover',
  pointerout: 'hover',
  pointerenter: 'hover',
  pointerleave: 'hover',
  dragstart: 'drag',
  dragend: 'drag',
  drag: 'drag',
  dragenter: 'drag',
  dragleave: 'drag',
  dragover: 'drag',
  drop: 'drag',
  keydown: 'press',
  keyup: 'press',
  keypress: 'press',
  input: 'press',
};

/** Starts tracking the Interaction to Next Paint on the current page. */
function _trackINP(): () => void {
  return addInpInstrumentationHandler(({ metric }) => {
    const client = getClient();
    if (!client || metric.value == undefined) {
      return;
    }

    const entry = metric.entries.find(entry => entry.duration === metric.value && INP_ENTRY_MAP[entry.name]);

    if (!entry) {
      return;
    }

    const { interactionId } = entry;
    const interactionType = INP_ENTRY_MAP[entry.name];

    const options = client.getOptions();
    /** Build the INP span, create an envelope from the span, and then send the envelope */
    const startTime = msToSec((browserPerformanceTimeOrigin as number) + entry.startTime);
    const duration = msToSec(metric.value);
    const scope = getCurrentScope();
    const activeSpan = getActiveSpan();
    const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;

    // We first try to lookup the route name from our INTERACTIONS_ROUTE_MAP,
    // where we cache the route per interactionId
    const cachedRouteName = interactionId != null ? INTERACTIONS_ROUTE_MAP.get(interactionId) : undefined;

    // Else, we try to use the active span.
    // Finally, we fall back to look at the transactionName on the scope
    const routeName =
      cachedRouteName || (rootSpan ? spanToJSON(rootSpan).description : scope.getScopeData().transactionName);

    const user = scope.getUser();

    // We need to get the replay, user, and activeTransaction from the current scope
    // so that we can associate replay id, profile id, and a user display to the span
    const replay = client.getIntegrationByName<Integration & { getReplayId: () => string }>('Replay');

    const replayId = replay && replay.getReplayId();

    const userDisplay = user !== undefined ? user.email || user.id || user.ip_address : undefined;
    let profileId: string | undefined = undefined;
    try {
      // @ts-expect-error skip optional chaining to save bundle size with try catch
      profileId = scope.getScopeData().contexts.profile.profile_id;
    } catch {
      // do nothing
    }

    const name = htmlTreeAsString(entry.target);
    const attributes: SpanAttributes = dropUndefinedKeys({
      release: options.release,
      environment: options.environment,
      transaction: routeName,
      [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: metric.value,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.browser.inp',
      user: userDisplay || undefined,
      profile_id: profileId || undefined,
      replay_id: replayId || undefined,
    });

    const span = startInactiveSpan({
      name,
      op: `ui.interaction.${interactionType}`,
      attributes,
      startTime: startTime,
      experimental: {
        standalone: true,
      },
    });

    span.addEvent('inp', {
      [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT]: 'millisecond',
      [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE]: metric.value,
    });

    span.end(startTime + duration);
  });
}

/** Register a listener to cache route information for INP interactions. */
export function registerInpInteractionListener(latestRoute: PartialRouteInfo): void {
  const handleEntries = ({ entries }: { entries: PerformanceEntry[] }): void => {
    entries.forEach(entry => {
      if (!isPerformanceEventTiming(entry) || !latestRoute.name) {
        return;
      }

      const interactionId = entry.interactionId;
      if (interactionId == null) {
        return;
      }

      // If the interaction was already recorded before, nothing more to do
      if (INTERACTIONS_ROUTE_MAP.has(interactionId)) {
        return;
      }

      // We keep max. 10 interactions in the list, then remove the oldest one & clean up
      if (LAST_INTERACTIONS.length > 10) {
        const last = LAST_INTERACTIONS.shift() as number;
        INTERACTIONS_ROUTE_MAP.delete(last);
      }

      // We add the interaction to the list of recorded interactions
      // and store the route information for this interaction
      // (we clone the object because it is mutated when it changes)
      LAST_INTERACTIONS.push(interactionId);
      INTERACTIONS_ROUTE_MAP.set(interactionId, latestRoute.name);
    });
  };

  addPerformanceInstrumentationHandler('event', handleEntries);
  addPerformanceInstrumentationHandler('first-input', handleEntries);
}
