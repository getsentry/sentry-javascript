import type { Span, SpanAttributes } from '@sentry/core';
import { getActiveSpan, getRootSpan, isBrowser } from '@sentry/core';
import {
  BROWSER_WEB_VITAL_INP_INPUT_DELAY,
  BROWSER_WEB_VITAL_INP_PRESENTATION_DELAY,
  BROWSER_WEB_VITAL_INP_PROCESSING_DURATION,
} from '@sentry/conventions/attributes';
import { htmlTreeAsString } from '../htmlTreeAsString';
import { WINDOW } from '../types';
import type { PerformanceEventTiming } from '../instrumentation/performanceObserver';
import { addPerformanceInstrumentationHandler, isPerformanceEventTiming } from '../instrumentation/performanceObserver';

interface InteractionContext {
  span: Span | undefined;
  elementName: string;
}

const LAST_INTERACTIONS: number[] = [];
const INTERACTIONS_SPAN_MAP = new Map<number, InteractionContext>();

// Map to store element names by timestamp, since we get the DOM event before the PerformanceObserver entry
/** What `htmlTreeAsString` returns when it cannot describe the target. */
export const UNKNOWN_ELEMENT_NAME = '<unknown>';

const ELEMENT_NAME_TIMESTAMP_MAP = new Map<number, string>();

/**
 * 60 seconds is the maximum for a plausible INP value
 * (source: Me)
 */
export const MAX_PLAUSIBLE_INP_DURATION = 60;

export type InteractionType = 'click' | 'hover' | 'drag' | 'press';

export const INP_ENTRY_MAP: Record<string, InteractionType> = {
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

/**
 * Look up a cached interaction context (element name + root span) by interactionId.
 * Returns undefined if no context was cached for this interaction.
 */
export function getCachedInteractionContext(interactionId: number | undefined): InteractionContext | undefined {
  return interactionId != null ? INTERACTIONS_SPAN_MAP.get(interactionId) : undefined;
}

/**
 * Register a listener to cache route information for INP interactions.
 */
export function registerInpInteractionListener(): void {
  // Listen for all interaction events that could contribute to INP
  const interactionEvents = Object.keys(INP_ENTRY_MAP);
  if (isBrowser()) {
    interactionEvents.forEach(eventType => {
      WINDOW.addEventListener(eventType, captureElementFromEvent, { capture: true, passive: true });
    });
  }

  /**
   * Captures the element name from a DOM event and stores it in the ELEMENT_NAME_TIMESTAMP_MAP.
   */
  function captureElementFromEvent(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const elementName = htmlTreeAsString(target);
    const timestamp = Math.round(event.timeStamp);

    // Not every event of an interaction has a describable target, and one that doesn't would
    // otherwise claim the timestamp and leave the span unnamed.
    if (!elementName || elementName === UNKNOWN_ELEMENT_NAME) {
      return;
    }

    // Every event of one interaction shares a timestamp, and so do the `pointerover`/`mouseover`
    // the browser fires afterwards when a handler swaps out the element under the cursor. Those
    // arrive last and describe the new DOM, so keeping the first usable name is what pins the entry
    // to the element that was actually interacted with.
    if (ELEMENT_NAME_TIMESTAMP_MAP.has(timestamp)) {
      return;
    }

    // Store the element name by timestamp so we can match it with the PerformanceEntry
    ELEMENT_NAME_TIMESTAMP_MAP.set(timestamp, elementName);

    // Clean up old
    if (ELEMENT_NAME_TIMESTAMP_MAP.size > 50) {
      const firstKey = ELEMENT_NAME_TIMESTAMP_MAP.keys().next().value;
      if (firstKey !== undefined) {
        ELEMENT_NAME_TIMESTAMP_MAP.delete(firstKey);
      }
    }
  }

  /**
   * Tries to get the element name from the timestamp map.
   */
  function resolveElementNameFromEntry(entry: PerformanceEntry): string {
    const timestamp = Math.round(entry.startTime);
    let elementName = ELEMENT_NAME_TIMESTAMP_MAP.get(timestamp);

    // try nearby timestamps (±5ms)
    if (!elementName) {
      for (let offset = -5; offset <= 5; offset++) {
        const nearbyName = ELEMENT_NAME_TIMESTAMP_MAP.get(timestamp + offset);
        if (nearbyName) {
          elementName = nearbyName;
          break;
        }
      }
    }

    return elementName || UNKNOWN_ELEMENT_NAME;
  }

  const handleEntries = ({ entries }: { entries: PerformanceEntry[] }): void => {
    const activeSpan = getActiveSpan();
    const activeRootSpan = activeSpan && getRootSpan(activeSpan);

    entries.forEach(entry => {
      if (!isPerformanceEventTiming(entry)) {
        return;
      }

      const interactionId = entry.interactionId;
      if (interactionId == null) {
        return;
      }

      // If the interaction was already recorded before, nothing more to do
      if (INTERACTIONS_SPAN_MAP.has(interactionId)) {
        return;
      }

      const elementName = entry.target ? htmlTreeAsString(entry.target) : resolveElementNameFromEntry(entry);

      // We keep max. 10 interactions in the list, then remove the oldest one & clean up
      if (LAST_INTERACTIONS.length > 10) {
        const last = LAST_INTERACTIONS.shift() as number;
        INTERACTIONS_SPAN_MAP.delete(last);
      }

      // We add the interaction to the list of recorded interactions
      // and store both the span and element name for this interaction
      LAST_INTERACTIONS.push(interactionId);
      INTERACTIONS_SPAN_MAP.set(interactionId, {
        span: activeRootSpan,
        elementName,
      });
    });
  };

  addPerformanceInstrumentationHandler('event', handleEntries);
  addPerformanceInstrumentationHandler('first-input', handleEntries);
}

/**
 * The INP subparts of one interaction, which add up to the time from the input to the next paint.
 *
 * An interaction is several events (e.g. `pointerdown`, `pointerup`, `click`) that share one
 * next paint, and the slow handler can be on any of them. Measuring a single entry would count
 * the other events' handlers as presentation delay, so the processing window spans all of them.
 */
export function getInpSubpartAttributes(
  entry: PerformanceEventTiming | undefined,
  metricEntries: PerformanceEventTiming[] = [],
): SpanAttributes | undefined {
  if (!entry) {
    return undefined;
  }

  const interactionEntries = metricEntries.filter(e => e.interactionId === entry.interactionId);
  const entries = interactionEntries.length ? interactionEntries : [entry];
  const startTime = Math.min(...entries.map(entry => entry.startTime));
  const processingStart = Math.min(...entries.map(entry => entry.processingStart));
  const processingEnd = Math.max(...entries.map(entry => entry.processingEnd));
  const nextPaintTime = Math.max(...entries.map(entry => entry.startTime + entry.duration));

  // `duration` is rounded to 8ms, so the presentation delay it implies can dip below zero.
  return {
    [BROWSER_WEB_VITAL_INP_INPUT_DELAY]: Math.max(processingStart - startTime, 0),
    [BROWSER_WEB_VITAL_INP_PROCESSING_DURATION]: Math.max(processingEnd - processingStart, 0),
    [BROWSER_WEB_VITAL_INP_PRESENTATION_DELAY]: Math.max(nextPaintTime - processingEnd, 0),
  };
}
