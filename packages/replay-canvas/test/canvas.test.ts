import { _replayCanvasIntegration } from '../src/canvas';

it('initializes with default options', () => {
  const rc = _replayCanvasIntegration();

  expect(rc.getOptions()).toEqual({
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
});

it('initializes with quality option and manual snapshot', () => {
  const rc = _replayCanvasIntegration({ enableManualSnapshot: true, quality: 'low' });

  expect(rc.getOptions()).toEqual({
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
});
