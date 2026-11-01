import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareSafeIdGeneratorContext } from '../../src/server/prepareSafeIdGeneratorContext';

const RUNNER_KEY = Symbol.for('__SENTRY_SAFE_RANDOM_ID_WRAPPER__');
const NEXT_WORK_UNIT_STORAGE_KEY = Symbol.for('@next/work-unit-async-storage@16.4.0');

type Runner = <T>(callback: () => T) => T;

function getRunner(): Runner {
  const runner = (globalThis as Record<symbol, unknown>)[RUNNER_KEY];
  if (typeof runner !== 'function') {
    throw new Error('runner not registered');
  }
  return runner as Runner;
}

function registerNextWorkUnitStorage(storage: AsyncLocalStorage<unknown>): void {
  (globalThis as Record<symbol, unknown>)[NEXT_WORK_UNIT_STORAGE_KEY] = storage;
}

/**
 * Mimics workerd with `bind_asynclocalstorage_snapshot_to_request`: a snapshot taken during one request throws when
 * it is called during another one.
 */
function bindSnapshotsToRequest(): { enterRequest: (id: number) => void } {
  const originalSnapshot = AsyncLocalStorage.snapshot.bind(AsyncLocalStorage);
  let currentRequest = 0;

  vi.spyOn(AsyncLocalStorage, 'snapshot').mockImplementation(() => {
    const boundRequest = currentRequest;
    const snapshot = originalSnapshot();
    return ((callback: () => unknown) => {
      if (currentRequest !== boundRequest) {
        throw new Error(
          'Cannot call this AsyncLocalStorage bound function outside of the request in which it was created.',
        );
      }
      return snapshot(callback);
    }) as ReturnType<typeof AsyncLocalStorage.snapshot>;
  });

  return {
    enterRequest: id => {
      currentRequest = id;
    },
  };
}

describe('prepareSafeIdGeneratorContext', () => {
  let workUnitStorage: AsyncLocalStorage<{ type: string }>;
  const prerenderStore = { type: 'prerender' };

  beforeEach(() => {
    workUnitStorage = new AsyncLocalStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, RUNNER_KEY);
    Reflect.deleteProperty(globalThis, NEXT_WORK_UNIT_STORAGE_KEY);
  });

  it('runs the callback outside of the Next.js work unit store using a snapshot', () => {
    prepareSafeIdGeneratorContext();

    const storeSeen = workUnitStorage.run(prerenderStore, () => getRunner()(() => workUnitStorage.getStore()));

    expect(storeSeen).toBeUndefined();
  });

  it('exits the work unit storage that Next.js registers on globalThis', () => {
    registerNextWorkUnitStorage(workUnitStorage);
    prepareSafeIdGeneratorContext();

    const storeSeen = workUnitStorage.run(prerenderStore, () => getRunner()(() => workUnitStorage.getStore()));

    expect(storeSeen).toBeUndefined();
  });

  it('keeps unrelated stores intact when exiting the work unit storage', () => {
    registerNextWorkUnitStorage(workUnitStorage);
    prepareSafeIdGeneratorContext();
    const otherStorage = new AsyncLocalStorage<string>();

    const storeSeen = otherStorage.run('request-data', () =>
      workUnitStorage.run(prerenderStore, () => getRunner()(() => otherStorage.getStore())),
    );

    expect(storeSeen).toBe('request-data');
  });

  it('does not run the callback inside a prerender of another request when snapshots are request-bound', () => {
    const { enterRequest } = bindSnapshotsToRequest();
    registerNextWorkUnitStorage(workUnitStorage);

    enterRequest(1);
    prepareSafeIdGeneratorContext();
    const runner = getRunner();

    enterRequest(2);
    const storeSeen = workUnitStorage.run(prerenderStore, () => runner(() => workUnitStorage.getStore()));

    expect(storeSeen).toBeUndefined();
  });

  it('finds the work unit storage that Next.js registers after the runner was prepared', () => {
    const { enterRequest } = bindSnapshotsToRequest();

    enterRequest(1);
    prepareSafeIdGeneratorContext();
    const runner = getRunner();
    registerNextWorkUnitStorage(workUnitStorage);

    enterRequest(2);
    const storeSeen = workUnitStorage.run(prerenderStore, () => runner(() => workUnitStorage.getStore()));

    expect(storeSeen).toBeUndefined();
  });

  it('ignores a registered storage whose exit throws, like the Next.js FakeAsyncLocalStorage', () => {
    const fakeStorage = {
      getStore: () => undefined,
      exit: () => {
        throw new Error('Invariant: AsyncLocalStorage accessed in runtime where it is not available');
      },
    };
    (globalThis as Record<symbol, unknown>)[NEXT_WORK_UNIT_STORAGE_KEY] = fakeStorage;
    prepareSafeIdGeneratorContext();

    const storeSeen = workUnitStorage.run(prerenderStore, () => getRunner()(() => workUnitStorage.getStore()));

    expect(storeSeen).toBeUndefined();
  });

  it('falls back to a fresh snapshot when Next.js does not register its storage', () => {
    const { enterRequest } = bindSnapshotsToRequest();

    enterRequest(1);
    prepareSafeIdGeneratorContext();
    const runner = getRunner();

    enterRequest(2);
    expect(runner(() => 'value')).toBe('value');
    expect(AsyncLocalStorage.snapshot).toHaveBeenCalledTimes(2);
  });
});
