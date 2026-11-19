import type { Client } from '../client';
import { DEBUG_BUILD } from '../debug-build';
import { defineIntegration } from '../integration';
import { _INTERNAL_flushMetricsBuffer } from '../metrics/internal';
import { count } from '../metrics/public-api';
import { Scope } from '../scope';
import type { Integration, IntegrationFn } from '../types/integration';
import { debug } from '../utils/debug-logger';
import { fnv1a32 } from '../utils/hash';
import { isPlainObject } from '../utils/is';
import { safeUnref } from '../utils/timer';

const _experimentalReportSdkConfigIntegration = (() => ({
  name: 'ExperimentalReportSdkConfig',
  afterAllSetup(client: Client) {
    const scope = new Scope();
    scope.setClient(client);
    let reported = false;

    const report = (): void => {
      if (reported) {
        return;
      }

      reported = true;
      clearTimeout(timer);

      try {
        count('sdk.config', 1, { attributes: buildConfigAttributes(client), scope });
      } catch (error) {
        DEBUG_BUILD && debug.warn('Failed to report SDK configuration', error);
      }
    };

    // Let the remaining afterAllSetup hooks register their integrations before taking the snapshot.
    const timer = safeUnref(setTimeout(report, 0));

    client.on('flush', () => {
      report();
      // Capturing can register the metrics flusher too late for this flush, or after an existing flusher.
      _INTERNAL_flushMetricsBuffer(client);
    });
  },
})) satisfies IntegrationFn;

/**
 * Reports the SDK options the user passed to `init()` on the next tick after client setup, or on an earlier flush.
 *
 * @experimental This integration may change or be removed without notice.
 */
export const experimentalReportSdkConfigIntegration = defineIntegration(_experimentalReportSdkConfigIntegration);

// Sort object keys recursively, preserving array order. Replace functions
// and unsupported values with fingerprints before hashing the config.
function serialize(value: unknown, ancestors = new Set<object>()): unknown {
  if (typeof value === 'function') {
    return `[Function:${fnv1a32(Function.prototype.toString.call(value))}]`;
  }

  // initialScope extras can contain bigints or symbols; JSON throws on bigints and omits symbols.
  if (typeof value === 'bigint' || typeof value === 'symbol') {
    return `[${typeof value}:${fnv1a32(String(value))}]`;
  }

  // Pass through primitives and null unchanged.
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof RegExp) {
    return value.toString();
  }

  // Stop recursion if an object references itself or an ancestor.
  if (ancestors.has(value)) {
    return '[Circular]';
  }

  if (!Array.isArray(value) && !isPlainObject(value)) {
    const type = String(Object.prototype.toString.call(value)).slice(8, -1);
    return `[${type}:${fnv1a32(String(value))}]`;
  }

  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    return value.map(item => serialize(item, nextAncestors) ?? null);
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const item: unknown = value[key];
    result[key] = item === undefined ? '[undefined]' : serialize(item, nextAncestors);
  }
  return result;
}

// Integrations are reported at the top level; serverName would split configurations by host.
const EXCLUDED_OPTIONS = new Set(['integrations', 'serverName']);

function buildConfigAttributes(client: Client): Record<string, string> {
  const { sdk, optionsSetByUser = [] } = client.getSdkMetadata() || {};
  const clientOptions = client.getOptions();
  const { release, environment, dist } = clientOptions;
  const runtime = 'runtime' in clientOptions ? clientOptions.runtime : undefined;

  // Only what the user passed, so SDK defaults never show up as config.
  const options: Record<string, unknown> = Object.fromEntries(
    Object.entries(clientOptions).filter(([key]) => optionsSetByUser.includes(key) && !EXCLUDED_OPTIONS.has(key)),
  );

  if (Array.isArray(options.defaultIntegrations)) {
    options.defaultIntegrations = options.defaultIntegrations.map((integration: Integration) => ({
      name: integration.name,
    }));
  }

  // The hash covers the whole payload, so a payload cached by its hash is never stale.
  const payload = JSON.stringify({
    version: 2,
    sdk: serialize(sdk),
    runtime: serialize(runtime),
    release,
    environment,
    dist,
    integrations: client.getIntegrationNames().map(name => ({ name })),
    options: serialize(options),
  });

  return {
    'sentry.sdk_config.hash': fnv1a32(payload),
    'sentry.sdk_config.payload': payload,
  };
}
