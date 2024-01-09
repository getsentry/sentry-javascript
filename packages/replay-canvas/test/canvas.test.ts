import { ReplayCanvas } from '../src/canvas';

it('initializes with default options', () => {
  const rc = new ReplayCanvas();

  expect(rc.getOptions()).toEqual({
    _experiments: {
      canvas: {
        manager: expect.any(Function),
        quality: 'medium',
      },
    },
  });
});

it('initializes with quality option', () => {
  const rc = new ReplayCanvas({ quality: 'low' });

  expect(rc.getOptions()).toEqual({
    _experiments: {
      canvas: {
        manager: expect.any(Function),
        quality: 'low',
      },
    },
  });
});
