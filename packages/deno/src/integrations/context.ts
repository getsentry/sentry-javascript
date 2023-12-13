import type { Event, EventProcessor, Integration } from '@sentry/types';

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

async function denoRuntime(event: Event): Promise<Event> {
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

/** Adds Electron context to events. */
export class DenoContext implements Integration {
  /** @inheritDoc */
  public static id = 'DenoContext';

  /** @inheritDoc */
  public name: string = DenoContext.id;

  /** @inheritDoc */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    // noop
  }

  /** @inheritDoc */
  public processEvent(event: Event): Promise<Event> {
    return denoRuntime(event);
  }
}
