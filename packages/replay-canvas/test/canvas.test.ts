/**
 * @vitest-environment jsdom
 */

import { CanvasManager } from '@sentry-internal/rrweb';
import { beforeEach, expect, it, vi } from 'vitest';
import { _replayCanvasIntegration, replayCanvasIntegration } from '../src/canvas';

vi.mock('@sentry-internal/rrweb');

beforeEach(() => {
  vi.clearAllMocks();
});

it('initializes with default options', () => {
  const rc = _replayCanvasIntegration();
  const options = rc.getOptions();

  expect(options).toEqual({
    recordCanvas: true,
    getCanvasManager: expect.any(Function),
    sampling: {
      canvas: 2,
    },
    dataURLOptions: {
      type: 'image/webp',
      quality: 0.4,
    },
  });

  // @ts-expect-error don't care about the normal options we need to call this with, just want to test maxCanvasSize
  options.getCanvasManager({});

  expect(CanvasManager).toHaveBeenCalledWith(
    expect.objectContaining({
      maxCanvasSize: [1280, 1280],
    }),
  );
});

it('initializes with quality option and manual snapshot', () => {
  const rc = _replayCanvasIntegration({ enableManualSnapshot: true, quality: 'low' });
  const options = rc.getOptions();

  expect(options).toEqual({
    enableManualSnapshot: true,
    recordCanvas: true,
    getCanvasManager: expect.any(Function),
    sampling: {
      canvas: 1,
    },
    dataURLOptions: {
      type: 'image/webp',
      quality: 0.25,
    },
  });

  // @ts-expect-error don't care about the normal options we need to call this with, just want to test maxCanvasSize
  options.getCanvasManager({});

  expect(CanvasManager).toHaveBeenCalledWith(
    expect.objectContaining({
      maxCanvasSize: [1280, 1280],
    }),
  );
});

it('enforces a max canvas size', () => {
  const rc = _replayCanvasIntegration({ enableManualSnapshot: true, quality: 'low', maxCanvasSize: [2000, 2000] });
  const options = rc.getOptions();

  expect(options).toEqual({
    enableManualSnapshot: true,
    recordCanvas: true,
    getCanvasManager: expect.any(Function),
    sampling: {
      canvas: 1,
    },
    dataURLOptions: {
      type: 'image/webp',
      quality: 0.25,
    },
  });

  // @ts-expect-error don't care about the normal options we need to call this with, just want to test maxCanvasSize
  options.getCanvasManager({});

  expect(CanvasManager).toHaveBeenCalledWith(
    expect.objectContaining({
      maxCanvasSize: [1280, 1280],
    }),
  );
});

it('has correct types', () => {
  const rc = replayCanvasIntegration();

  expect(typeof rc.snapshot).toBe('function');
  const res = rc.snapshot();
  expect(res).toBeInstanceOf(Promise);

  // Function signature is correctly typed
  const res2 = rc.snapshot(document.createElement('canvas'));
  expect(res2).toBeInstanceOf(Promise);
});

it('tracks current canvas manager across multiple getCanvasManager calls', async () => {
  const rc = _replayCanvasIntegration({ enableManualSnapshot: true });
  const options = rc.getOptions();

  // First call - simulates initial recording session
  // @ts-expect-error don't care about the normal options we need to call this with
  options.getCanvasManager({});
  expect(CanvasManager).toHaveBeenCalledTimes(1);

  const mockManager1 = vi.mocked(CanvasManager).mock.results[0].value;
  mockManager1.snapshot = vi.fn();

  // Second call - simulates session refresh after inactivity or max age
  // @ts-expect-error don't care about the normal options we need to call this with
  options.getCanvasManager({});
  expect(CanvasManager).toHaveBeenCalledTimes(2);

  const mockManager2 = vi.mocked(CanvasManager).mock.results[1].value;
  mockManager2.snapshot = vi.fn();

  void rc.snapshot();

  await new Promise(resolve => setTimeout(resolve, 0));

  expect(mockManager1.snapshot).toHaveBeenCalledTimes(0);
  expect(mockManager2.snapshot).toHaveBeenCalledTimes(1);
});
