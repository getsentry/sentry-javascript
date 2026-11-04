import * as SentryCore from '@sentry/core';
import type { Task } from 'nitro/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentTasks } from '../../../src/runtime/utils/instrumentTasks';

vi.mock('@sentry/core', async importOriginal => {
  const mod = await importOriginal();
  return {
    ...(mod as any),
    captureException: vi.fn(),
  };
});

const taskEvent = { name: 'test-task', payload: {}, context: {} };

describe('instrumentTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures and rethrows errors thrown by a task', async () => {
    const error = new Error('Task failed');
    const task: Task = { run: () => Promise.reject(error) };
    const tasks = { 'test-task': { resolve: () => Promise.resolve(task) } };

    instrumentTasks(tasks);
    const handler = await tasks['test-task'].resolve();

    await expect(handler.run(taskEvent)).rejects.toBe(error);
    expect(SentryCore.captureException).toHaveBeenCalledWith(error, {
      captureContext: { contexts: { nitro: { task: 'test-task' } } },
      mechanism: { handled: false, type: 'auto.function.nitro.task' },
    });
  });

  it('returns the task result and does not capture on success', async () => {
    const task: Task = { meta: { description: 'desc' }, run: () => Promise.resolve({ result: 'ok' }) };
    const tasks = { 'test-task': { resolve: () => Promise.resolve(task) } };

    instrumentTasks(tasks);
    const handler = await tasks['test-task'].resolve();

    await expect(handler.run(taskEvent)).resolves.toEqual({ result: 'ok' });
    expect(handler.meta).toEqual({ description: 'desc' });
    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });

  it('does not wrap the cached task again on repeated resolves', async () => {
    const error = new Error('Task failed');
    const task: Task = { run: () => Promise.reject(error) };
    const tasks = { 'test-task': { resolve: () => Promise.resolve(task) } };

    instrumentTasks(tasks);
    await tasks['test-task'].resolve();
    const handler = await tasks['test-task'].resolve();

    await expect(handler.run(taskEvent)).rejects.toBe(error);
    expect(SentryCore.captureException).toHaveBeenCalledTimes(1);
  });

  it('skips tasks without a handler', () => {
    const tasks = { 'test-task': { resolve: undefined } };

    expect(() => instrumentTasks(tasks)).not.toThrow();
    expect(tasks['test-task'].resolve).toBeUndefined();
  });
});
