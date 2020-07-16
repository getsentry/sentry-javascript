export * from './exports';

import { Integrations as CoreIntegrations } from '@sentry/core';
import { getGlobalObject } from '@sentry/utils';

import { Breadcrumbs, GlobalHandlers, LinkedErrors, TryCatch, UserAgent } from './integrations';
import { BaseTransport, FetchTransport, XHRTransport } from './transports';

let windowIntegrations = {};

// This block is needed to add compatibility with the integrations packages when used with a CDN
// tslint:disable: no-unsafe-any
const _window = getGlobalObject<Window>();
if (_window.Sentry && _window.Sentry.Integrations) {
  windowIntegrations = _window.Sentry.Integrations;
}
// tslint:enable: no-unsafe-any

const INTEGRATIONS = {
  ...windowIntegrations,
  ...CoreIntegrations,
  Breadcrumbs,
  GlobalHandlers,
  LinkedErrors,
  TryCatch,
  UserAgent,
};

const TRANSPORTS = {
  BaseTransport,
  FetchTransport,
  XHRTransport,
};

export { INTEGRATIONS as Integrations, TRANSPORTS as Transports };
