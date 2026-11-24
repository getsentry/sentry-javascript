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
import { createInteractionCache } from './interactionCache';

interface InteractionContext {
  span: Span | undefined;
  elementName: string;
  interactionId: number;
  latency: number;
}

/**
 * The event timing entries presented in one frame, merged the way web-vitals' attribution build
 * merges them to split INP into its subparts.
 */
interface FrameTiming {
  startTime: number;
  processingStart: number;
  processingEnd: number;
  renderTime: number;
}

const INTERACTIONS = createInteractionCache<InteractionContext, PerformanceEventTiming>({
  match: (context, entry) => context.interactionId === entry.interactionId,
  merge: (context, entry) => {
    context.latency = Math.max(context.latency, entry.duration);
  },
  latency: context => context.latency,
});

const FRAMES = createInteractionCache<FrameTiming, PerformanceEventTiming>({
  match: (frame, entry) => Math.abs(entry.startTime + entry.duration - frame.renderTime) <= 8,
  merge: (frame, entry) => {
    frame.startTime = Math.min(frame.startTime, entry.startTime);
    frame.processingStart = Math.min(frame.processingStart, entry.processingStart);
    frame.processingEnd = Math.max(frame.processingEnd, entry.processingEnd);
  },
  latency: frame => frame.renderTime - frame.startTime,
});

/**
 * web-vitals observes INP with this `durationThreshold`, so its attribution only ever sees these.
 */
const INP_DURATION_THRESHOLD = 40;

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
 * Look up the cached interaction context (element name + root span) of the interaction an entry
 * belongs to. Returns undefined if no context was cached for this interaction.
 */
export function getCachedInteractionContext(entry: PerformanceEventTiming | undefined): InteractionContext | undefined {
  return entry?.interactionId ? INTERACTIONS.get(entry) : undefined;
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

      if (entry.duration >= INP_DURATION_THRESHOLD) {
        FRAMES.add(entry, () => ({
          startTime: entry.startTime,
          processingStart: entry.processingStart,
          processingEnd: entry.processingEnd,
          renderTime: entry.startTime + entry.duration,
        }));
      }

      const interactionId = entry.interactionId;
      if (!interactionId) {
        return;
      }

      // The element and span are taken from the first entry of the interaction
      INTERACTIONS.add(entry, () => ({
        span: activeRootSpan,
        elementName: entry.target ? htmlTreeAsString(entry.target) : resolveElementNameFromEntry(entry),
        interactionId,
        latency: entry.duration,
      }));
    });
  };

  addPerformanceInstrumentationHandler('event', handleEntries);
  addPerformanceInstrumentationHandler('first-input', handleEntries);
}

/**
 * The INP subparts of the interaction an INP entry belongs to, computed like web-vitals' attribution
 * build does: from all events presented in the same frame, so a slow handler on any of them counts.
 */
export function getInpSubpartAttributes(entry: PerformanceEventTiming | undefined): SpanAttributes | undefined {
  const frame = entry && FRAMES.get(entry);
  if (!frame) {
    return undefined;
  }

  const processingStart = Math.max(frame.processingStart, entry.startTime);
  // `duration` is rounded to 8ms, so the next paint can appear to come before processing starts.
  const nextPaintTime = Math.max(entry.startTime + entry.duration, processingStart);
  // A sync modal like `alert()` keeps processing past the next paint (GoogleChrome/web-vitals#492).
  const processingEnd = Math.min(Math.max(frame.processingEnd, processingStart), nextPaintTime);

  return {
    [BROWSER_WEB_VITAL_INP_INPUT_DELAY]: processingStart - entry.startTime,
    [BROWSER_WEB_VITAL_INP_PROCESSING_DURATION]: processingEnd - processingStart,
    [BROWSER_WEB_VITAL_INP_PRESENTATION_DELAY]: nextPaintTime - processingEnd,
  };
}
