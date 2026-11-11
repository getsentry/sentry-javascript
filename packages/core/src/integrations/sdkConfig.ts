import type { Client } from '../client';
import { DEBUG_BUILD } from '../debug-build';
import { defineIntegration } from '../integration';
import { count } from '../metrics/public-api';
import { Scope } from '../scope';
import type { IntegrationFn } from '../types/integration';
import { debug } from '../utils/debug-logger';
import { fnv1a32 } from '../utils/hash';
import { isPlainObject } from '../utils/is';
import { timestampInSeconds } from '../utils/time';
import { safeUnref } from '../utils/timer';

const _experimentalSdkConfigIntegration = (() => ({
  name: 'ExperimentalSdkConfig',
  afterAllSetup(client: Client) {
    const scope = new Scope();
    scope.setClient(client);

    // Allow configuration to settle before capturing it.
    const timer = safeUnref(
      setTimeout(() => {
        try {
          const attributes = buildConfigAttributes(client);
          count('sdk.config', 1, { attributes, scope });
        } catch (error) {
          DEBUG_BUILD && debug.warn('Failed to report SDK configuration', error);
        }
      }, 5000),
    );

    client.on('close', () => {
      clearTimeout(timer);
    });
  },
})) satisfies IntegrationFn;

/**
 * Reports effective SDK configuration once after initialization.
 *
 * @experimental This integration may change or be removed without notice.
 */
export const experimentalSdkConfigIntegration = defineIntegration(_experimentalSdkConfigIntegration);

function hash(value: string): string {
  return fnv1a32(value).toString(36);
}

// Sort object keys recursively, preserving array order. Replace functions
// and unsupported values with fingerprints before hashing the config.
function serialize(value: unknown, ancestors = new Set<object>()): unknown {
  if (typeof value === 'function') {
    return `[Function:${hash(Function.prototype.toString.call(value))}]`;
  }

  // initialScope extras can contain bigints or symbols; JSON throws on bigints and omits symbols.
  if (typeof value === 'bigint' || typeof value === 'symbol') {
    return `[${typeof value}:${hash(String(value))}]`;
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
    return `[${type}:${hash(String(value))}]`;
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
    options: serialize(options) as Record<string, unknown>,
    integrations: client.getIntegrationNames().map(name => ({ name })),
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
    'sentry.sdk_config.hash': hash(JSON.stringify(hashInput)),
    'sentry.sdk_config.payload': JSON.stringify(payload),
  };
}
