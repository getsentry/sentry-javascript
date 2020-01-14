export * from './exports';

import * as Apm from '@sentry/apm';
import { Integrations as CoreIntegrations } from '@sentry/core';
import { getGlobalObject } from '@sentry/utils';

import * as BrowserIntegrations from './integrations';
import * as Transports from './transports';

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
  ...BrowserIntegrations,
  Tracing: Apm.Integrations.Tracing,
};

export { INTEGRATIONS as Integrations, Transports };
