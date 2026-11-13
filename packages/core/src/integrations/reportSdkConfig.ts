import type { Client } from '../client';
import { DEBUG_BUILD } from '../debug-build';
import { defineIntegration } from '../integration';
import { _INTERNAL_flushMetricsBuffer } from '../metrics/internal';
import { count } from '../metrics/public-api';
import { Scope } from '../scope';
import type { IntegrationFn } from '../types/integration';
import { debug } from '../utils/debug-logger';
import { fnv1a32 } from '../utils/hash';
import { isPlainObject } from '../utils/is';
import { timestampInSeconds } from '../utils/time';
import { safeUnref } from '../utils/timer';

const _experimentalReportSdkConfigIntegration = (() => ({
  name: 'ExperimentalReportSdkConfig',
  afterAllSetup(client: Client) {
    const scope = new Scope();
    scope.setClient(client);
    let reported = false;

    const report = (): void => {
      // The timer and flush hook can both request capture; only report once.
      if (reported) {
        return;
      }

      reported = true;
      clearTimeout(timer);

      try {
        const attributes = buildConfigAttributes(client);
        count('sdk.config', 1, { attributes, scope });
      } catch (error) {
        DEBUG_BUILD && debug.warn('Failed to report SDK configuration', error);
      }
    };

    // Allow configuration to settle unless the client flushes earlier.
    const timer = safeUnref(setTimeout(report, 5000));

    // Close, tab hiding, and natural Node process exit trigger flushing.
    client.on('flush', () => {
      report();
      // report() may register the first metric flusher too late for this flush,
      // or run after an existing flusher. Drain explicitly to cover both cases.
      _INTERNAL_flushMetricsBuffer(client);
    });
  },
})) satisfies IntegrationFn;

/**
 * Reports effective SDK configuration once after initialization.
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
    if (item !== undefined) {
      result[key] = serialize(item, nextAncestors);
    }
  }
  return result;
}

function buildConfigAttributes(client: Client): Record<string, string> {
  // Integrations are reported separately; SDK metadata lives under `sdk`.
  const options = Object.fromEntries(
    Object.entries(client.getOptions()).filter(
      ([key]) => !['integrations', 'defaultIntegrations', '_metadata'].includes(key),
    ),
  );

  const config = {
    version: 1,
    sdk: client.getSdkMetadata()?.sdk,
    options: serialize({
      ...options,
      dataCollection: client.getDataCollectionOptions(),
    }) as Record<string, unknown>,
    options_set_by_user: client.getSdkMetadata()?.optionsSetByUser,
    integrations: client.getIntegrationNames().map(name => ({
      name,
      options: serialize(client.getIntegrationByName(name)?._options),
    })),
  };

  const metadata = {
    timestamp: timestampInSeconds(),
    release: options.release,
    environment: options.environment,
    dist: options.dist,
  };

  // Exclude reporting metadata and instance-specific defaults from config identity.
  const hashExclusions = new Set(['server_name', ...Object.keys(metadata)]);

  const hashInput = {
    ...config,
    options: Object.fromEntries(Object.entries(config.options).filter(([key]) => !hashExclusions.has(key))),
  };

  const payload = {
    ...config,
    ...metadata,
  };

  return {
    'sentry.sdk_config.hash': fnv1a32(JSON.stringify(hashInput)),
    'sentry.sdk_config.payload': JSON.stringify(payload),
  };
}
