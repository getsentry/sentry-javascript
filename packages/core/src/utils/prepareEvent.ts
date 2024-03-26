import type {
  CaptureContext,
  Client,
  ClientOptions,
  Event,
  EventHint,
  Scope as ScopeInterface,
  ScopeContext,
  StackFrame,
  StackParser,
} from '@sentry/types';
import { GLOBAL_OBJ, addExceptionMechanism, dateTimestampInSeconds, normalize, truncate, uuid4 } from '@sentry/utils';

import { DEFAULT_ENVIRONMENT } from '../constants';
import { getGlobalScope } from '../currentScopes';
import { notifyEventProcessors } from '../eventProcessors';
import { Scope } from '../scope';
import { applyScopeDataToEvent, mergeScopeData } from './applyScopeDataToEvent';

/**
 * This type makes sure that we get either a CaptureContext, OR an EventHint.
 * It does not allow mixing them, which could lead to unexpected outcomes, e.g. this is disallowed:
 * { user: { id: '123' }, mechanism: { handled: false } }
 */
export type ExclusiveEventHintOrCaptureContext =
  | (CaptureContext & Partial<{ [key in keyof EventHint]: never }>)
  | (EventHint & Partial<{ [key in keyof ScopeContext]: never }>);

/**
 * Adds common information to events.
 *
 * The information includes release and environment from `options`,
 * breadcrumbs and context (extra, tags and user) from the scope.
 *
 * Information that is already present in the event is never overwritten. For
 * nested objects, such as the context, keys are merged.
 *
 * @param event The original event.
 * @param hint May contain additional information about the original exception.
 * @param scope A scope containing event metadata.
 * @returns A new event with more information.
 * @hidden
 */
export function prepareEvent(
  options: ClientOptions,
  event: Event,
  hint: EventHint,
  scope?: ScopeInterface,
  client?: Client,
  isolationScope?: ScopeInterface,
): PromiseLike<Event | null> {
  const { normalizeDepth = 3, normalizeMaxBreadth = 1_000 } = options;
  const prepared: Event = {
    ...event,
    event_id: event.event_id || hint.event_id || uuid4(),
    timestamp: event.timestamp || dateTimestampInSeconds(),
  };
  const integrations = hint.integrations || options.integrations.map(i => i.name);

  applyClientOptions(prepared, options);
  applyIntegrationsMetadata(prepared, integrations);

  // Only put debug IDs onto frames for error events.
  if (event.type === undefined) {
    applyDebugIds(prepared, options.stackParser);
  }

  // If we have scope given to us, use it as the base for further modifications.
  // This allows us to prevent unnecessary copying of data if `captureContext` is not provided.
  const finalScope = getFinalScope(scope, hint.captureContext);

  if (hint.mechanism) {
    addExceptionMechanism(prepared, hint.mechanism);
  }

  const clientEventProcessors = client ? client.getEventProcessors() : [];

  // This should be the last thing called, since we want that
  // {@link Hub.addEventProcessor} gets the finished prepared event.
  // Merge scope data together
  const data = getGlobalScope().getScopeData();

  if (isolationScope) {
    const isolationData = isolationScope.getScopeData();
    mergeScopeData(data, isolationData);
  }

  if (finalScope) {
    const finalScopeData = finalScope.getScopeData();
    mergeScopeData(data, finalScopeData);
  }

  const attachments = [...(hint.attachments || []), ...data.attachments];
  if (attachments.length) {
    hint.attachments = attachments;
  }

  applyScopeDataToEvent(prepared, data);

  const eventProcessors = [
    ...clientEventProcessors,
    // Run scope event processors _after_ all other processors
    ...data.eventProcessors,
  ];

  const result = notifyEventProcessors(eventProcessors, prepared, hint);

  return result.then(evt => {
    if (evt) {
      // We apply the debug_meta field only after all event processors have ran, so that if any event processors modified
      // file names (e.g.the RewriteFrames integration) the filename -> debug ID relationship isn't destroyed.
      // This should not cause any PII issues, since we're only moving data that is already on the event and not adding
      // any new data
      applyDebugMeta(evt);
    }

    if (typeof normalizeDepth === 'number' && normalizeDepth > 0) {
      return normalizeEvent(evt, normalizeDepth, normalizeMaxBreadth);
    }
    return evt;
  });
}

/**
 *  Enhances event using the client configuration.
 *  It takes care of all "static" values like environment, release and `dist`,
 *  as well as truncating overly long values.
 * @param event event instance to be enhanced
 */
function applyClientOptions(event: Event, options: ClientOptions): void {
  const { environment, release, dist, maxValueLength = 250 } = options;

  if (!('environment' in event)) {
    event.environment = 'environment' in options ? environment : DEFAULT_ENVIRONMENT;
  }

  if (event.release === undefined && release !== undefined) {
    event.release = release;
  }

  if (event.dist === undefined && dist !== undefined) {
    event.dist = dist;
  }

  if (event.message) {
    event.message = truncate(event.message, maxValueLength);
  }

  const exception = event.exception && event.exception.values && event.exception.values[0];
  if (exception && exception.value) {
    exception.value = truncate(exception.value, maxValueLength);
  }

  const request = event.request;
  if (request && request.url) {
    request.url = truncate(request.url, maxValueLength);
  }
}

const debugIdStackParserCache = new WeakMap<StackParser, Map<string, StackFrame[]>>();

/**
 * Puts debug IDs into the stack frames of an error event.
 */
export function applyDebugIds(event: Event, stackParser: StackParser): void {
  const debugIdMap = GLOBAL_OBJ._sentryDebugIds;

  if (!debugIdMap) {
    return;
  }

  let debugIdStackFramesCache: Map<string, StackFrame[]>;
  const cachedDebugIdStackFrameCache = debugIdStackParserCache.get(stackParser);
  if (cachedDebugIdStackFrameCache) {
    debugIdStackFramesCache = cachedDebugIdStackFrameCache;
  } else {
    debugIdStackFramesCache = new Map<string, StackFrame[]>();
    debugIdStackParserCache.set(stackParser, debugIdStackFramesCache);
  }

  // Build a map of filename -> debug_id
  const filenameDebugIdMap = Object.keys(debugIdMap).reduce<Record<string, string>>((acc, debugIdStackTrace) => {
    let parsedStack: StackFrame[];
    const cachedParsedStack = debugIdStackFramesCache.get(debugIdStackTrace);
    if (cachedParsedStack) {
      parsedStack = cachedParsedStack;
    } else {
      parsedStack = stackParser(debugIdStackTrace);
      debugIdStackFramesCache.set(debugIdStackTrace, parsedStack);
    }

    for (let i = parsedStack.length - 1; i >= 0; i--) {
      const stackFrame = parsedStack[i];
      if (stackFrame.filename) {
        acc[stackFrame.filename] = debugIdMap[debugIdStackTrace];
        break;
      }
    }
    return acc;
  }, {});

  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    event!.exception!.values!.forEach(exception => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      exception.stacktrace!.frames!.forEach(frame => {
        if (frame.filename) {
          frame.debug_id = filenameDebugIdMap[frame.filename];
        }
      });
    });
  } catch (e) {
    // To save bundle size we're just try catching here instead of checking for the existence of all the different objects.
  }
}

/**
 * Moves debug IDs from the stack frames of an error event into the debug_meta field.
 */
export function applyDebugMeta(event: Event): void {
  // Extract debug IDs and filenames from the stack frames on the event.
  const filenameDebugIdMap: Record<string, string> = {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    event.exception!.values!.forEach(exception => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      exception.stacktrace!.frames!.forEach(frame => {
        if (frame.debug_id) {
          if (frame.abs_path) {
            filenameDebugIdMap[frame.abs_path] = frame.debug_id;
          } else if (frame.filename) {
            filenameDebugIdMap[frame.filename] = frame.debug_id;
          }
          delete frame.debug_id;
        }
      });
    });
  } catch (e) {
    // To save bundle size we're just try catching here instead of checking for the existence of all the different objects.
  }

  if (Object.keys(filenameDebugIdMap).length === 0) {
    return;
  }

  // Fill debug_meta information
  event.debug_meta = event.debug_meta || {};
  event.debug_meta.images = event.debug_meta.images || [];
  const images = event.debug_meta.images;
  Object.keys(filenameDebugIdMap).forEach(filename => {
    images.push({
      type: 'sourcemap',
      code_file: filename,
      debug_id: filenameDebugIdMap[filename],
    });
  });
}

/**
 * This function adds all used integrations to the SDK info in the event.
 * @param event The event that will be filled with all integrations.
 */
function applyIntegrationsMetadata(event: Event, integrationNames: string[]): void {
  if (integrationNames.length > 0) {
    event.sdk = event.sdk || {};
    event.sdk.integrations = [...(event.sdk.integrations || []), ...integrationNames];
  }
}

/**
 * Applies `normalize` function on necessary `Event` attributes to make them safe for serialization.
 * Normalized keys:
 * - `breadcrumbs.data`
 * - `user`
 * - `contexts`
 * - `extra`
 * @param event Event
 * @returns Normalized event
 */
function normalizeEvent(event: Event | null, depth: number, maxBreadth: number): Event | null {
  if (!event) {
    return null;
  }

  const normalized: Event = {
    ...event,
    ...(event.breadcrumbs && {
      breadcrumbs: event.breadcrumbs.map(b => ({
        ...b,
        ...(b.data && {
          data: normalize(b.data, depth, maxBreadth),
        }),
      })),
    }),
    ...(event.user && {
      user: normalize(event.user, depth, maxBreadth),
    }),
    ...(event.contexts && {
      contexts: normalize(event.contexts, depth, maxBreadth),
    }),
    ...(event.extra && {
      extra: normalize(event.extra, depth, maxBreadth),
    }),
  };

  // event.contexts.trace stores information about a Transaction. Similarly,
  // event.spans[] stores information about child Spans. Given that a
  // Transaction is conceptually a Span, normalization should apply to both
  // Transactions and Spans consistently.
  // For now the decision is to skip normalization of Transactions and Spans,
  // so this block overwrites the normalized event to add back the original
  // Transaction information prior to normalization.
  if (event.contexts && event.contexts.trace && normalized.contexts) {
    normalized.contexts.trace = event.contexts.trace;

    // event.contexts.trace.data may contain circular/dangerous data so we need to normalize it
    if (event.contexts.trace.data) {
      normalized.contexts.trace.data = normalize(event.contexts.trace.data, depth, maxBreadth);
    }
  }

  // event.spans[].data may contain circular/dangerous data so we need to normalize it
  if (event.spans) {
    normalized.spans = event.spans.map(span => {
      return {
        ...span,
        ...(span.data && {
          data: normalize(span.data, depth, maxBreadth),
        }),
      };
    });
  }

  return normalized;
}

function getFinalScope(
  scope: ScopeInterface | undefined,
  captureContext: CaptureContext | undefined,
): ScopeInterface | undefined {
  if (!captureContext) {
    return scope;
  }

  const finalScope = scope ? scope.clone() : new Scope();
  finalScope.update(captureContext);
  return finalScope;
}

/**
 * Parse either an `EventHint` directly, or convert a `CaptureContext` to an `EventHint`.
 * This is used to allow to update method signatures that used to accept a `CaptureContext` but should now accept an `EventHint`.
 */
export function parseEventHintOrCaptureContext(
  hint: ExclusiveEventHintOrCaptureContext | undefined,
): EventHint | undefined {
  if (!hint) {
    return undefined;
  }

  // If you pass a Scope or `() => Scope` as CaptureContext, we just return this as captureContext
  if (hintIsScopeOrFunction(hint)) {
    return { captureContext: hint };
  }

  if (hintIsScopeContext(hint)) {
    return {
      captureContext: hint,
    };
  }

  return hint;
}

function hintIsScopeOrFunction(
  hint: CaptureContext | EventHint,
): hint is ScopeInterface | ((scope: ScopeInterface) => ScopeInterface) {
  return hint instanceof Scope || typeof hint === 'function';
}

type ScopeContextProperty = keyof ScopeContext;
const captureContextKeys: readonly ScopeContextProperty[] = [
  'user',
  'level',
  'extra',
  'contexts',
  'tags',
  'fingerprint',
  'requestSession',
  'propagationContext',
] as const;

function hintIsScopeContext(hint: Partial<ScopeContext> | EventHint): hint is Partial<ScopeContext> {
  return Object.keys(hint).some(key => captureContextKeys.includes(key as ScopeContextProperty));
}
