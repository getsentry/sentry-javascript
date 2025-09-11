import type { CfProperties, ExecutionContext } from '@cloudflare/workers-types';

interface EventBase {
  protocol: string;
  host: string;
  method: string;
  headers: Record<string, string>;
}

interface MinimalCloudflareProps {
  context: ExecutionContext;
  request?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

// Direct shape: cf and cloudflare are directly on context
interface CfEventDirect extends EventBase {
  context: {
    cf: CfProperties;
    cloudflare: MinimalCloudflareProps;
  };
}

// Nested shape: cf and cloudflare are under _platform
// Since Nitro v2.11.7 (PR: https://github.com/nitrojs/nitro/pull/3224)
interface CfEventPlatform extends EventBase {
  context: {
    _platform: {
      cf: CfProperties;
      cloudflare: MinimalCloudflareProps;
    };
  };
}

export type CfEventType = CfEventDirect | CfEventPlatform;

function hasCfAndCloudflare(context: unknown): boolean {
  return (
    context !== null &&
    typeof context === 'object' &&
    // context.cf properties
    'cf' in context &&
    typeof context.cf === 'object' &&
    context.cf !== null &&
    // context.cloudflare properties
    'cloudflare' in context &&
    typeof context.cloudflare === 'object' &&
    context.cloudflare !== null &&
    'context' in context.cloudflare
  );
}

/**
 * Type guard to check if an event is a Cloudflare event (nested in _platform or direct)
 */
export function isEventType(event: unknown): event is CfEventType {
  if (event === null || typeof event !== 'object') return false;

  return (
    // basic properties
    'protocol' in event &&
    'host' in event &&
    typeof event.protocol === 'string' &&
    typeof event.host === 'string' &&
    // context property
    'context' in event &&
    typeof event.context === 'object' &&
    event.context !== null &&
    // context.cf properties
    (hasCfAndCloudflare(event.context) || ('_platform' in event.context && hasCfAndCloudflare(event.context._platform)))
  );
}

/**
 * Extracts cf properties from a Cloudflare event
 */
export function getCfProperties(event: CfEventType): CfProperties {
  if ('cf' in event.context) {
    return event.context.cf;
  }
  return event.context._platform.cf;
}

/**
 * Extracts cloudflare properties from a Cloudflare event
 */
export function getCloudflareProperties(event: CfEventType): MinimalCloudflareProps {
  if ('cloudflare' in event.context) {
    return event.context.cloudflare;
  }
  return event.context._platform.cloudflare;
}
