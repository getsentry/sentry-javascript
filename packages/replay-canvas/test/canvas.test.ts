import { CanvasManager } from '@sentry-internal/rrweb';
import { _replayCanvasIntegration, replayCanvasIntegration } from '../src/canvas';

jest.mock('@sentry-internal/rrweb');

beforeEach(() => {
  jest.clearAllMocks();
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
