import type { HandlerDataDom } from '@sentry/core';
import { addHandler, addNonEnumerableProperty, fill, maybeInstrument, triggerHandlers, uuid4 } from '@sentry/core';
import { WINDOW } from '../types';

type SentryWrappedTarget = HTMLElement & { _sentryId?: string };

type AddEventListener = (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
) => void;
type RemoveEventListener = (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions,
) => void;

type InstrumentedElement = Element & {
  __sentry_instrumentation_handlers__?: {
    [key in 'click' | 'keypress']?: {
      handler?: unknown;
      /** The number of custom listeners attached to this element */
      refCount: number;
    };
  };
};

const DEBOUNCE_DURATION = 1000;

let debounceTimerID: number | undefined;
let lastCapturedEventType: string | undefined;
let lastCapturedEventTargetId: string | undefined;

/**
 * Add an instrumentation handler for when a click or a keypress happens.
 *
 * Use at your own risk, this might break without changelog notice, only used internally.
 * @hidden
 */
export function addClickKeypressInstrumentationHandler(handler: (data: HandlerDataDom) => void): void {
  const type = 'dom';
  addHandler(type, handler);
  maybeInstrument(type, instrumentDOM);
}

/** Exported for tests only. */
export function instrumentDOM(): void {
  if (!WINDOW.document) {
    return;
  }

  // Make it so that any click or keypress that is unhandled / bubbled up all the way to the document triggers our dom
  // handlers. (Normally we have only one, which captures a breadcrumb for each click or keypress.) Do this before
  // we instrument `addEventListener` so that we don't end up attaching this handler twice.
  const triggerDOMHandler = triggerHandlers.bind(null, 'dom');
  const globalDOMEventHandler = makeDOMEventHandler(triggerDOMHandler, true);
  WINDOW.document.addEventListener('click', globalDOMEventHandler, false);
  WINDOW.document.addEventListener('keypress', globalDOMEventHandler, false);

  // After hooking into click and keypress events bubbled up to `document`, we also hook into user-handled
  // clicks & keypresses, by adding an event listener of our own to any element to which they add a listener. That
  // way, whenever one of their handlers is triggered, ours will be, too. (This is needed because their handler
  // could potentially prevent the event from bubbling up to our global listeners. This way, our handler are still
  // guaranteed to fire at least once.)
  ['EventTarget', 'Node'].forEach((target: string) => {
    const globalObject = WINDOW as unknown as Record<string, { prototype?: object }>;
    const targetObj = globalObject[target];
    const proto = targetObj && targetObj.prototype;

    // eslint-disable-next-line no-prototype-builtins
    if (!proto || !proto.hasOwnProperty || !proto.hasOwnProperty('addEventListener')) {
      return;
    }

    fill(proto, 'addEventListener', function (originalAddEventListener: AddEventListener): AddEventListener {
      return function (this: InstrumentedElement, type, listener, options): AddEventListener {
        if (type === 'click' || type == 'keypress') {
          try {
            const handlers = (this.__sentry_instrumentation_handlers__ =
              this.__sentry_instrumentation_handlers__ || {});
            const handlerForType = (handlers[type] = handlers[type] || { refCount: 0 });

            if (!handlerForType.handler) {
              const handler = makeDOMEventHandler(triggerDOMHandler);
              handlerForType.handler = handler;
              originalAddEventListener.call(this, type, handler, options);
            }

            handlerForType.refCount++;
          } catch (e) {
            // Accessing dom properties is always fragile.
            // Also allows us to skip `addEventListeners` calls with no proper `this` context.
          }
        }

        return originalAddEventListener.call(this, type, listener, options);
      };
    });

    fill(
      proto,
      'removeEventListener',
      function (originalRemoveEventListener: RemoveEventListener): RemoveEventListener {
        return function (this: InstrumentedElement, type, listener, options): () => void {
          if (type === 'click' || type == 'keypress') {
            try {
              const handlers = this.__sentry_instrumentation_handlers__ || {};
              const handlerForType = handlers[type];

              if (handlerForType) {
                handlerForType.refCount--;
                // If there are no longer any custom handlers of the current type on this element, we can remove ours, too.
                if (handlerForType.refCount <= 0) {
                  originalRemoveEventListener.call(this, type, handlerForType.handler, options);
                  handlerForType.handler = undefined;
                  delete handlers[type]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
                }

                // If there are no longer any custom handlers of any type on this element, cleanup everything.
                if (Object.keys(handlers).length === 0) {
                  delete this.__sentry_instrumentation_handlers__;
                }
              }
            } catch (e) {
              // Accessing dom properties is always fragile.
              // Also allows us to skip `addEventListeners` calls with no proper `this` context.
            }
          }

          return originalRemoveEventListener.call(this, type, listener, options);
        };
      },
    );
  });
}

/**
 * Check whether the event is similar to the last captured one. For example, two click events on the same button.
 */
function isSimilarToLastCapturedEvent(event: Event): boolean {
  // If both events have different type, then user definitely performed two separate actions. e.g. click + keypress.
  if (event.type !== lastCapturedEventType) {
    return false;
  }

  try {
    // If both events have the same type, it's still possible that actions were performed on different targets.
    // e.g. 2 clicks on different buttons.
    if (!event.target || (event.target as SentryWrappedTarget)._sentryId !== lastCapturedEventTargetId) {
      return false;
    }
  } catch (e) {
    // just accessing `target` property can throw an exception in some rare circumstances
    // see: https://github.com/getsentry/sentry-javascript/issues/838
  }

  // If both events have the same type _and_ same `target` (an element which triggered an event, _not necessarily_
  // to which an event listener was attached), we treat them as the same action, as we want to capture
  // only one breadcrumb. e.g. multiple clicks on the same button, or typing inside a user input box.
  return true;
}

/**
 * Decide whether an event should be captured.
 * @param event event to be captured
 */
function shouldSkipDOMEvent(eventType: string, target: SentryWrappedTarget | null): boolean {
  // We are only interested in filtering `keypress` events for now.
  if (eventType !== 'keypress') {
    return false;
  }

  if (!target || !target.tagName) {
    return true;
  }

  // Only consider keypress events on actual input elements. This will disregard keypresses targeting body
  // e.g.tabbing through elements, hotkeys, etc.
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return false;
  }

  return true;
}

/**
 * Wraps addEventListener to capture UI breadcrumbs
 */
function makeDOMEventHandler(
  handler: (data: HandlerDataDom) => void,
  globalListener: boolean = false,
): (event: Event) => void {
  return (event: Event & { _sentryCaptured?: true }): void => {
    // It's possible this handler might trigger multiple times for the same
    // event (e.g. event propagation through node ancestors).
    // Ignore if we've already captured that event.
    if (!event || event['_sentryCaptured']) {
      return;
    }

    const target = getEventTarget(event);

    // We always want to skip _some_ events.
    if (shouldSkipDOMEvent(event.type, target)) {
      return;
    }

    // Mark event as "seen"
    addNonEnumerableProperty(event, '_sentryCaptured', true);

    if (target && !target._sentryId) {
      // Add UUID to event target so we can identify if
      addNonEnumerableProperty(target, '_sentryId', uuid4());
    }

    const name = event.type === 'keypress' ? 'input' : event.type;

    // If there is no last captured event, it means that we can safely capture the new event and store it for future comparisons.
    // If there is a last captured event, see if the new event is different enough to treat it as a unique one.
    // If that's the case, emit the previous event and store locally the newly-captured DOM event.
    if (!isSimilarToLastCapturedEvent(event)) {
      const handlerData: HandlerDataDom = { event, name, global: globalListener };
      handler(handlerData);
      lastCapturedEventType = event.type;
      lastCapturedEventTargetId = target ? target._sentryId : undefined;
    }

    // Start a new debounce timer that will prevent us from capturing multiple events that should be grouped together.
    clearTimeout(debounceTimerID);
    debounceTimerID = WINDOW.setTimeout(() => {
      lastCapturedEventTargetId = undefined;
      lastCapturedEventType = undefined;
    }, DEBOUNCE_DURATION);
  };
}

function getEventTarget(event: Event): SentryWrappedTarget | null {
  try {
    return event.target as SentryWrappedTarget | null;
  } catch (e) {
    // just accessing `target` property can throw an exception in some rare circumstances
    // see: https://github.com/getsentry/sentry-javascript/issues/838
    return null;
  }
}
