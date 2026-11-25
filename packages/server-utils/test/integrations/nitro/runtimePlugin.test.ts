import * as SentryCore from '@sentry/core';
import * as SentryCoreServer from '@sentry/core/server';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { NitroTask, NitroTaskRegistry } from '../../../src/integrations/nitro/nitroTypes';
import { setupSentryNitroApp } from '../../../src/integrations/nitro/runtimePlugin';

const taskEvent = { name: 'db:cleanup', payload: {}, context: {} };

function createNitroApp() {
  const hooks: Record<string, (...args: unknown[]) => unknown> = {};
  return {
    hooks: { hook: vi.fn((name: string, callback: (...args: unknown[]) => unknown) => (hooks[name] = callback)) },
    callHook: (name: string, ...args: unknown[]) => hooks[name]?.(...args),
  };
}

function createTasks(task: NitroTask): NitroTaskRegistry & { 'db:cleanup': { resolve: () => Promise<NitroTask> } } {
  return { 'db:cleanup': { resolve: () => Promise.resolve(task) } };
}

describe('setupSentryNitroApp', () => {
  let captureExceptionSpy: MockInstance;

  beforeEach(() => {
    captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => 'id');
    vi.spyOn(SentryCoreServer, 'flushIfServerless').mockResolvedValue(undefined);
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({ getOptions: () => ({}) } as SentryCore.Client);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures errors that reach the Nitro `error` hook', async () => {
    const nitroApp = createNitroApp();
    const error = new Error('Database unavailable');

    setupSentryNitroApp(nitroApp, {});
    await nitroApp.callHook('error', error, { event: { req: { method: 'GET', url: 'http://localhost/api' } } });

    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      captureContext: { contexts: { nitro: { method: 'GET', path: '/api' } } },
      mechanism: { handled: false, type: 'auto.function.nitro.captureErrorHook' },
    });
  });

  it('captures and rethrows errors thrown by a task', async () => {
    const error = new Error('Task failed');
    const tasks = createTasks({ run: () => Promise.reject(error) });

    setupSentryNitroApp(createNitroApp(), tasks);
    const handler = await tasks['db:cleanup'].resolve();

    await expect(handler.run(taskEvent)).rejects.toBe(error);
    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      captureContext: { contexts: { nitro: { task: 'db:cleanup' } } },
      mechanism: { handled: false, type: 'auto.function.nitro.task' },
    });
  });

  it('returns the task result and keeps the other task fields', async () => {
    const tasks = createTasks({
      meta: { description: 'desc' },
      run: () => Promise.resolve({ result: 'ok' }),
    } as NitroTask);

    setupSentryNitroApp(createNitroApp(), tasks);
    const handler = (await tasks['db:cleanup'].resolve()) as NitroTask & { meta: unknown };

    await expect(handler.run(taskEvent)).resolves.toEqual({ result: 'ok' });
    expect(handler.meta).toEqual({ description: 'desc' });
    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it('does not wrap the cached task again on repeated resolves', async () => {
    const error = new Error('Task failed');
    const tasks = createTasks({ run: () => Promise.reject(error) });

    setupSentryNitroApp(createNitroApp(), tasks);
    await tasks['db:cleanup'].resolve();
    const handler = await tasks['db:cleanup'].resolve();

    await expect(handler.run(taskEvent)).rejects.toBe(error);
    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
  });

  it('skips tasks without a handler', () => {
    const tasks: NitroTaskRegistry = { 'db:cleanup': { resolve: undefined } };

    expect(() => setupSentryNitroApp(createNitroApp(), tasks)).not.toThrow();
    expect(tasks['db:cleanup']?.resolve).toBeUndefined();
  });
});
