export type { Carrier, Layer } from '@sentry/core';

import {
  Hub as HubCore,
  Scope as ScopeCore,
  SessionFlusher as SessionFlusherCore,
  addBreadcrumb as addBreadcrumbCore,
  addGlobalEventProcessor as addGlobalEventProcessorCore,
  captureEvent as captureEventCore,
  captureException as captureExceptionCore,
  captureMessage as captureMessageCore,
  closeSession as closeSessionCore,
  configureScope as configureScopeCore,
  getCurrentHub as getCurrentHubCore,
  getHubFromCarrier as getHubFromCarrierCore,
  getMainCarrier as getMainCarrierCore,
  makeMain as makeMainCore,
  makeSession as makeSessionCore,
  setContext as setContextCore,
  setExtra as setExtraCore,
  setExtras as setExtrasCore,
  setHubOnCarrier as setHubOnCarrierCore,
  setTag as setTagCore,
  setTags as setTagsCore,
  setUser as setUserCore,
  startTransaction as startTransactionCore,
  updateSession as updateSessionCore,
  withScope as withScopeCore,
} from '@sentry/core';

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8
 */
export class Hub extends HubCore {}

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8
 */
export class Scope extends ScopeCore {}

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const getCurrentHub = getCurrentHubCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const addGlobalEventProcessor = addGlobalEventProcessorCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const getHubFromCarrier = getHubFromCarrierCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const getMainCarrier = getMainCarrierCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const makeMain = makeMainCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const setHubOnCarrier = setHubOnCarrierCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const SessionFlusher = SessionFlusherCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const closeSession = closeSessionCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const makeSession = makeSessionCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const updateSession = updateSessionCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const addBreadcrumb = addBreadcrumbCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const captureException = captureExceptionCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const captureEvent = captureEventCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const captureMessage = captureMessageCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const configureScope = configureScopeCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const startTransaction = startTransactionCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const setContext = setContextCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const setExtra = setExtraCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const setExtras = setExtrasCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const setTag = setTagCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const setTags = setTagsCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const setUser = setUserCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
export const withScope = withScopeCore;
