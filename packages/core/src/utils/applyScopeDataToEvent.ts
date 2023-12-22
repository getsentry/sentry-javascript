import type { Breadcrumb, Event, PropagationContext, ScopeData, Span } from '@sentry/types';
import { arrayify } from '@sentry/utils';

/**
 * Applies data from the scope to the event and runs all event processors on it.
 */
export function applyScopeDataToEvent(event: Event, data: ScopeData): void {
  const { fingerprint, span, breadcrumbs, sdkProcessingMetadata, propagationContext } = data;

  // Apply general data
  applyDataToEvent(event, data);

  // We want to set the trace context for normal events only if there isn't already
  // a trace context on the event. There is a product feature in place where we link
  // errors with transaction and it relies on that.
  if (span) {
    applySpanToEvent(event, span);
  }

  applyFingerprintToEvent(event, fingerprint);
  applyBreadcrumbsToEvent(event, breadcrumbs);
  applySdkMetadataToEvent(event, sdkProcessingMetadata, propagationContext);
}

/** Merge data of two scopes together. */
export function mergeScopeData(data: ScopeData, mergeData: ScopeData): void {
  const {
    extra,
    tags,
    user,
    contexts,
    level,
    sdkProcessingMetadata,
    breadcrumbs,
    fingerprint,
    eventProcessors,
    attachments,
    propagationContext,
    transactionName,
    span,
  } = mergeData;

  mergePropOverwrite(data, 'extra', extra);
  mergePropOverwrite(data, 'tags', tags);
  mergePropOverwrite(data, 'user', user);
  mergePropOverwrite(data, 'contexts', contexts);
  mergePropOverwrite(data, 'sdkProcessingMetadata', sdkProcessingMetadata);

  if (level) {
    data.level = level;
  }

  if (transactionName) {
    data.transactionName = transactionName;
  }

  if (span) {
    data.span = span;
  }

  if (breadcrumbs.length) {
    data.breadcrumbs = [...data.breadcrumbs, ...breadcrumbs];
  }

  if (fingerprint.length) {
    data.fingerprint = [...data.fingerprint, ...fingerprint];
  }

  if (eventProcessors.length) {
    data.eventProcessors = [...data.eventProcessors, ...eventProcessors];
  }

  if (attachments.length) {
    data.attachments = [...data.attachments, ...attachments];
  }

  data.propagationContext = { ...data.propagationContext, ...propagationContext };
}

/**
 * Merge properties, overwriting existing keys.
 * Exported only for tests.
 */
export function mergePropOverwrite<
  Prop extends 'extra' | 'tags' | 'user' | 'contexts' | 'sdkProcessingMetadata',
  Data extends ScopeData | Event,
>(data: Data, prop: Prop, mergeVal: Data[Prop]): void {
  if (mergeVal && Object.keys(mergeVal).length) {
    data[prop] = { ...data[prop], ...mergeVal };
  }
}

/**
 * Merge properties, keeping existing keys.
 * Exported only for tests.
 */
export function mergePropKeep<
  Prop extends 'extra' | 'tags' | 'user' | 'contexts' | 'sdkProcessingMetadata',
  Data extends ScopeData | Event,
>(data: Data, prop: Prop, mergeVal: Data[Prop]): void {
  if (mergeVal && Object.keys(mergeVal).length) {
    data[prop] = { ...mergeVal, ...data[prop] };
  }
}

/** Exported only for tests */
export function mergeArray<Prop extends 'breadcrumbs' | 'fingerprint'>(
  event: Event,
  prop: Prop,
  mergeVal: ScopeData[Prop],
): void {
  const prevVal = event[prop];
  // If we are not merging any new values,
  // we only need to proceed if there was an empty array before (as we want to replace it with undefined)
  if (!mergeVal.length && (!prevVal || prevVal.length)) {
    return;
  }

  const merged = [...(prevVal || []), ...mergeVal] as ScopeData[Prop];
  event[prop] = merged.length ? merged : undefined;
}

function applyDataToEvent(event: Event, data: ScopeData): void {
  const { extra, tags, user, contexts, level, transactionName } = data;

  if (extra && Object.keys(extra).length) {
    event.extra = { ...extra, ...event.extra };
  }
  if (tags && Object.keys(tags).length) {
    event.tags = { ...tags, ...event.tags };
  }
  if (user && Object.keys(user).length) {
    event.user = { ...user, ...event.user };
  }
  if (contexts && Object.keys(contexts).length) {
    event.contexts = { ...contexts, ...event.contexts };
  }
  if (level) {
    event.level = level;
  }
  if (transactionName) {
    event.transaction = transactionName;
  }
}

function applyBreadcrumbsToEvent(event: Event, breadcrumbs: Breadcrumb[]): void {
  const mergedBreadcrumbs = [...(event.breadcrumbs || []), ...breadcrumbs];
  event.breadcrumbs = mergedBreadcrumbs.length ? mergedBreadcrumbs : undefined;
}

function applySdkMetadataToEvent(
  event: Event,
  sdkProcessingMetadata: ScopeData['sdkProcessingMetadata'],
  propagationContext: PropagationContext,
): void {
  event.sdkProcessingMetadata = {
    ...event.sdkProcessingMetadata,
    ...sdkProcessingMetadata,
    propagationContext: propagationContext,
  };
}

function applySpanToEvent(event: Event, span: Span): void {
  event.contexts = { trace: span.getTraceContext(), ...event.contexts };
  const transaction = span.transaction;
  if (transaction) {
    event.sdkProcessingMetadata = {
      dynamicSamplingContext: transaction.getDynamicSamplingContext(),
      ...event.sdkProcessingMetadata,
    };
    const transactionName = transaction.name;
    if (transactionName) {
      event.tags = { transaction: transactionName, ...event.tags };
    }
  }
}

/**
 * Applies fingerprint from the scope to the event if there's one,
 * uses message if there's one instead or get rid of empty fingerprint
 */
function applyFingerprintToEvent(event: Event, fingerprint: ScopeData['fingerprint'] | undefined): void {
  // Make sure it's an array first and we actually have something in place
  event.fingerprint = event.fingerprint ? arrayify(event.fingerprint) : [];

  // If we have something on the scope, then merge it with event
  if (fingerprint) {
    event.fingerprint = event.fingerprint.concat(fingerprint);
  }

  // If we have no data at all, remove empty array default
  if (event.fingerprint && !event.fingerprint.length) {
    delete event.fingerprint;
  }
}
