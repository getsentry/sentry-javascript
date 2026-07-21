import type { Options } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';
import type { BrowserOptions } from '@sentry/react';

export type RemixOptions = (Options | BrowserOptions | NodeOptions) & {
  /**
   * Controls which `action` form data fields are captured and attached to spans/errors.
   *
   * This option only takes effect when incoming request bodies are collected, i.e. when
   * `dataCollection.httpBodies` includes `'incomingRequest'`:
   *
   * ```js
   * Sentry.init({
   *   captureActionFormDataKeys: { username: true },
   *   dataCollection: { httpBodies: ['incomingRequest'] },
   * });
   * ```
   */
  captureActionFormDataKeys?: Record<string, string | boolean>;
  // TODO(v11): Remove the requirement to also set `dataCollection.httpBodies`. Setting `captureActionFormDataKeys` should be enough to opt into capturing the configured form values
};
