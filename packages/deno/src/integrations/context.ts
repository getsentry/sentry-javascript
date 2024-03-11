import { defineIntegration } from '@sentry/core';
import type { Event, IntegrationFn } from '@sentry/types';

const INTEGRATION_NAME = 'DenoContext';

function getOSName(): string {
  switch (Deno.build.os) {
    case 'darwin':
      return 'macOS';
    case 'linux':
      return 'Linux';
    case 'windows':
      return 'Windows';
    default:
      return Deno.build.os;
  }
}

function getOSRelease(): string | undefined {
  return Deno.permissions.querySync({ name: 'sys', kind: 'osRelease' }).state === 'granted'
    ? Deno.osRelease()
    : undefined;
}

async function addDenoRuntimeContext(event: Event): Promise<Event> {
  event.contexts = {
    ...{
      app: {
        app_start_time: new Date(Date.now() - performance.now()).toISOString(),
      },
      device: {
        arch: Deno.build.arch,
        // eslint-disable-next-line no-restricted-globals
        processor_count: navigator.hardwareConcurrency,
      },
      os: {
        name: getOSName(),
        version: getOSRelease(),
      },
      v8: {
        name: 'v8',
        version: Deno.version.v8,
      },
      typescript: {
        name: 'TypeScript',
        version: Deno.version.typescript,
      },
    },
    ...event.contexts,
  };

  return event;
}

const _denoContextIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    processEvent(event) {
      return addDenoRuntimeContext(event);
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Deno related context to events. This includes contexts about app, device, os, v8, and TypeScript.
 *
 * Enabled by default in the Deno SDK.
 *
 * ```js
 * Sentry.init({
 *   integrations: [
 *     Sentry.denoContextIntegration(),
 *   ],
 * })
 * ```
 */
export const denoContextIntegration = defineIntegration(_denoContextIntegration);
