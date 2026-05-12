import type { Span } from '@sentry/core';
import { getActiveSpan, getRootSpan, htmlTreeAsString, isBrowser } from '@sentry/core';
import { WINDOW } from '../types';
import { addPerformanceInstrumentationHandler, isPerformanceEventTiming } from './instrument';

interface InteractionContext {
  span: Span | undefined;
  elementName: string;
}

const LAST_INTERACTIONS: number[] = [];
const INTERACTIONS_SPAN_MAP = new Map<number, InteractionContext>();

// Map to store element names by timestamp, since we get the DOM event before the PerformanceObserver entry
const ELEMENT_NAME_TIMESTAMP_MAP = new Map<number, string>();

/**
 * 60 seconds is the maximum for a plausible INP value
 * (source: Me)
 */
export const MAX_PLAUSIBLE_INP_DURATION = 60;

export const INP_ENTRY_MAP: Record<string, 'click' | 'hover' | 'drag' | 'press'> = {
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

    return elementName || '<unknown>';
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
