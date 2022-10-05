/* eslint-disable deprecation/deprecation */

export type { Carrier, Layer } from '@sentry/core';

import {
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
  Hub,
  makeMain as makeMainCore,
  makeSession as makeSessionCore,
  Scope,
  SessionFlusher as SessionFlusherCore,
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
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const getCurrentHub = getCurrentHubCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const addGlobalEventProcessor = addGlobalEventProcessorCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const getHubFromCarrier = getHubFromCarrierCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const getMainCarrier = getMainCarrierCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const makeMain = makeMainCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const setHubOnCarrier = setHubOnCarrierCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const SessionFlusher = SessionFlusherCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const closeSession = closeSessionCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const makeSession = makeSessionCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const updateSession = updateSessionCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const addBreadcrumb = addBreadcrumbCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const captureException = captureExceptionCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const captureEvent = captureEventCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const captureMessage = captureMessageCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const configureScope = configureScopeCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const startTransaction = startTransactionCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const setContext = setContextCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const setExtra = setExtraCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const setExtras = setExtrasCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const setTag = setTagCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const setTags = setTagsCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const setUser = setUserCore;

/**
 * @deprecated This export has moved to @sentry/core. The @sentry/hub package will be removed in v8.
 */
const withScope = withScopeCore;

export {
  addBreadcrumb,
  addGlobalEventProcessor,
  captureEvent,
  captureException,
  captureMessage,
  closeSession,
  configureScope,
  getCurrentHub,
  getHubFromCarrier,
  getMainCarrier,
  Hub,
  makeMain,
  makeSession,
  Scope,
  SessionFlusher,
  setContext,
  setExtra,
  setExtras,
  setHubOnCarrier,
  setTag,
  setTags,
  setUser,
  startTransaction,
  updateSession,
  withScope,
};
