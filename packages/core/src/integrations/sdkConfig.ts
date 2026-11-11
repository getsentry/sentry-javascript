import type { Client } from '../client';
import { DEBUG_BUILD } from '../debug-build';
import { defineIntegration } from '../integration';
import { count } from '../metrics/public-api';
import { Scope } from '../scope';
import type { IntegrationFn } from '../types/integration';
import { debug } from '../utils/debug-logger';
import { isPlainObject } from '../utils/is';
import { timestampInSeconds } from '../utils/time';
import { safeUnref } from '../utils/timer';

const OPTION_EXCLUSIONS = new Set(['integrations', 'defaultIntegrations', '_metadata']);

const _experimentalSdkConfigIntegration = (() => ({
  name: 'ExperimentalSdkConfig',
  afterAllSetup(client: Client) {
    let closed = false;
    const scope = new Scope();
    scope.setClient(client);

    // Allow configuration to settle before capturing it.
    const timer = safeUnref(
      setTimeout(() => {
        void buildConfigAttributes(client)
          .then(attributes => {
            if (!closed) {
              count('sdk.config', 1, { attributes, scope });
            }
          })
          .catch((error: unknown) => {
            DEBUG_BUILD && debug.warn('Failed to report SDK configuration', error);
          });
      }, 5000),
    );

    client.on('close', () => {
      closed = true;
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

async function hash(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Sort object keys recursively, preserving array order. Replace functions
// and unsupported values with fingerprints before hashing the config.
async function serialize(value: unknown, ancestors = new Set<object>()): Promise<unknown> {
  if (typeof value === 'function') {
    return `[Function:${await hash(Function.prototype.toString.call(value))}]`;
  }

  if (value === null || typeof value !== 'object') {
    if (typeof value === 'bigint' || typeof value === 'symbol') {
      return `[${typeof value}:${await hash(String(value))}]`;
    }
    return value;
  }

  if (value instanceof RegExp) {
    return value.toString();
  }

  if (ancestors.has(value)) {
    return '[Circular]';
  }

  if (!Array.isArray(value) && !isPlainObject(value)) {
    const type = String(Object.prototype.toString.call(value)).slice(8, -1);
    return `[${type}:${await hash(String(value))}]`;
  }

  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    return Promise.all(value.map(async item => (await serialize(item, nextAncestors)) ?? null));
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const item: unknown = value[key];
    if (item !== undefined) {
      result[key] = await serialize(item, nextAncestors);
    }
  }
  return result;
}

async function buildConfigAttributes(client: Client): Promise<Record<string, string>> {
  // Integrations are reported separately; SDK metadata lives under `sdk`.
  const options = Object.fromEntries(
    Object.entries(client.getOptions()).filter(([key]) => !OPTION_EXCLUSIONS.has(key)),
  );

  const config = {
    version: 1,
    sdk: client.getSdkMetadata()?.sdk,
    options: (await serialize(options)) as Record<string, unknown>,
    integrations: client.getIntegrationNames().map(name => ({ name })),
  };

  const metadata = {
    timestamp: timestampInSeconds(),
    release: options.release,
    environment: options.environment,
    dist: options.dist,
  };

  // Top-level reporting metadata must not affect config identity.
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
    'sentry.sdk_config.hash': await hash(JSON.stringify(hashInput)),
    'sentry.sdk_config.payload': JSON.stringify(payload),
  };
}
