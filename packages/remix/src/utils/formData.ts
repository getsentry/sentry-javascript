import type { Client, Span } from '@sentry/core';
import { _INTERNAL_filterKeyValueData } from '@sentry/core';
import type { RemixOptions } from './remixOptions';

/**
 * Resolved form-data capture config. `keys` is `undefined` when every field should be captured.
 */
export interface FormDataCapture {
  keys: Record<string, string | boolean> | undefined;
}

/**
 * Resolves whether (and which) `action` form data fields to capture.
 *
 * `captureActionFormDataKeys` is an integration-level option, so it takes precedence over
 * `dataCollection.httpBodies` rather than being gated by it. Without it, `httpBodies` decides,
 * in which case there is no configured key list and all fields are captured.
 */
export function resolveFormDataCapture(client: Client | undefined): FormDataCapture | undefined {
  if (!client) {
    return undefined;
  }

  const keys = (client.getOptions() as RemixOptions).captureActionFormDataKeys;
  if (keys) {
    return { keys };
  }

  return client.getDataCollectionOptions().httpBodies.includes('incomingRequest') ? { keys: undefined } : undefined;
}

/**
 * Sets form-data span attributes under `attributePrefix`, honoring the configured key list and
 * renames. Values are run through the shared sensitive-key filter, so an allowlisted `password`
 * still reports as `[Filtered]` rather than in the clear.
 */
export function applyFormDataAttributes(
  span: Span,
  formData: FormData,
  { keys }: FormDataCapture,
  attributePrefix: string,
): void {
  const collected: Record<string, string> = {};

  formData.forEach((value, key) => {
    const mapped = keys ? keys[key] : true;
    if (!mapped) {
      return;
    }

    // Renames apply to the reported attribute name, but filtering must run against the original
    // field name — otherwise renaming `password` to `pw` would defeat the denylist.
    const attributeName = typeof mapped === 'string' ? mapped : key;
    // File uploads report the filename rather than the contents.
    const reported = typeof value === 'string' ? value : value.name || '[non-string value]';
    const filtered = _INTERNAL_filterKeyValueData({ [key]: reported }, true);

    collected[attributeName] = filtered[key] as string;
  });

  for (const [key, value] of Object.entries(collected)) {
    span.setAttribute(`${attributePrefix}${key}`, value);
  }
}
