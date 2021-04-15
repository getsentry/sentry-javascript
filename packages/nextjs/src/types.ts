/**
 * THIS IS AN AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
 *
 * More detail can be found in the script that (compiles to the script that) generated this file,
 * `/scripts/generate-types.ts`.
 */

import * as nodeSDK from '@sentry/node';
import * as reactSDK from '@sentry/react';

export { Severity } from '@sentry/node';
export { Status } from '@sentry/node';
export { addGlobalEventProcessor } from '@sentry/node';
export { addBreadcrumb } from '@sentry/node';
export { captureException } from '@sentry/node';
export { captureEvent } from '@sentry/node';
export { captureMessage } from '@sentry/node';
export { configureScope } from '@sentry/node';
export { getHubFromCarrier } from '@sentry/node';
export { getCurrentHub } from '@sentry/node';
export { Hub } from '@sentry/node';
export { makeMain } from '@sentry/node';
export { Scope } from '@sentry/node';
export { startTransaction } from '@sentry/node';
export { SDK_VERSION } from '@sentry/node';
export { setContext } from '@sentry/node';
export { setExtra } from '@sentry/node';
export { setExtras } from '@sentry/node';
export { setTag } from '@sentry/node';
export { setTags } from '@sentry/node';
export { setUser } from '@sentry/node';
export { withScope } from '@sentry/node';
export { NodeBackend } from '@sentry/node';
export { NodeClient } from '@sentry/node';
const nodeDefaultIntegrationsNames = [
  'InboundFilters',
  'FunctionToString',
  'Console',
  'Http',
  'OnUncaughtException',
  'OnUnhandledRejection',
];
const reactDefaultIntegrationsNames = ['TryCatch', 'Breadcrumbs', 'GlobalHandlers', 'UserAgent'];
const nodeDefaultIntegrations = nodeSDK.defaultIntegrations.filter(
  element => element.name in nodeDefaultIntegrationsNames,
);
const reactDefaultIntegrations = reactSDK.defaultIntegrations.filter(
  element => element.name in reactDefaultIntegrationsNames,
);
export const defaultIntegrations = [...nodeDefaultIntegrations, ...reactDefaultIntegrations];
export { init } from '@sentry/node';
export { Handlers } from '@sentry/node';
const nodeTransportsNames = ['BaseTransport', 'HTTPTransport', 'HTTPSTransport'];
const reactTransportsNames = ['FetchTransport', 'XHRTransport'];
const nodeTransports = {} as { [key: string]: any };
const reactTransports = {} as { [key: string]: any };
nodeTransportsNames.forEach(elementName => {
  nodeTransports[elementName] = nodeSDK.Transports[elementName as keyof typeof nodeSDK.Transports];
});
reactTransportsNames.forEach(elementName => {
  reactTransports[elementName] = reactSDK.Transports[elementName as keyof typeof reactSDK.Transports];
});
export const Transports = { ...nodeTransports, ...reactTransports };
const nodeIntegrationsNames = [
  'FunctionToString',
  'InboundFilters',
  'Console',
  'Http',
  'OnUncaughtException',
  'OnUnhandledRejection',
  'LinkedErrors',
  'Modules',
];
const reactIntegrationsNames = ['GlobalHandlers', 'TryCatch', 'Breadcrumbs', 'UserAgent'];
const nodeIntegrations = {} as { [key: string]: any };
const reactIntegrations = {} as { [key: string]: any };
nodeIntegrationsNames.forEach(elementName => {
  nodeIntegrations[elementName] = nodeSDK.Integrations[elementName as keyof typeof nodeSDK.Integrations];
});
reactIntegrationsNames.forEach(elementName => {
  reactIntegrations[elementName] = reactSDK.Integrations[elementName as keyof typeof reactSDK.Integrations];
});
export const Integrations = { ...nodeIntegrations, ...reactIntegrations };
export { BrowserClient } from '@sentry/react';
export { injectReportDialog } from '@sentry/react';
export { eventFromException } from '@sentry/react';
export { eventFromMessage } from '@sentry/react';
export { forceLoad } from '@sentry/react';
export { onLoad } from '@sentry/react';
export { showReportDialog } from '@sentry/react';
export { wrap } from '@sentry/react';
export { Profiler } from '@sentry/react';
export { withProfiler } from '@sentry/react';
export { useProfiler } from '@sentry/react';
export { ErrorBoundary } from '@sentry/react';
export { withErrorBoundary } from '@sentry/react';
export { createReduxEnhancer } from '@sentry/react';
export { reactRouterV3Instrumentation } from '@sentry/react';
export { reactRouterV4Instrumentation } from '@sentry/react';
export { reactRouterV5Instrumentation } from '@sentry/react';
export { withSentryRouting } from '@sentry/react';
