import type { Options } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';
import type { BrowserOptions } from '@sentry/react';

export type RemixOptions = (Options | BrowserOptions | NodeOptions) & {
  /**
   * Controls which `action` form data fields are captured and attached to spans/errors, optionally
   * renaming them (`{ username: 'user' }` reports `username` as `user`).
   *
   * Setting this option is enough to opt into capturing the configured fields, and it takes
   * precedence over `dataCollection.httpBodies`:
   *
   * ```js
   * Sentry.init({
   *   captureActionFormDataKeys: { username: true },
   * });
   * ```
   *
   * When this option is not set, all form fields are captured if `dataCollection.httpBodies`
   * includes `'incomingRequest'` (the default). Either way, values whose field name looks
   * sensitive (`password`, `token`, …) are replaced with `[Filtered]`.
   */
  captureActionFormDataKeys?: Record<string, string | boolean>;
};
