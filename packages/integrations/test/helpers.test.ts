import { getFramesFromEvent } from '../src/helpers';

describe('getFramesFromEvent', () => {
  it('event.exception.values[0].stacktrace.frames', () => {
    const frames = getFramesFromEvent({
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: '/www/src/app/file1.js',
                },
                {
                  filename: '/www/src/app/file2.js',
                },
              ],
            },
          },
        ],
      },
    });
    expect(frames).toEqual([
      {
        filename: '/www/src/app/file1.js',
      },
      {
        filename: '/www/src/app/file2.js',
      },
    ]);
  });

  it('event.stacktrace.frames', () => {
    const frames = getFramesFromEvent({
      stacktrace: {
        frames: [
          {
            filename: '/www/src/app/file1.js',
          },
          {
            filename: '/www/src/app/file2.js',
          },
        ],
      },
    });
    expect(frames).toEqual([
      {
        filename: '/www/src/app/file1.js',
      },
      {
        filename: '/www/src/app/file2.js',
      },
    ]);
  });

  it('event.threads[0].stacktrace.frames', () => {
    const frames = getFramesFromEvent({
      threads: [
        {
          stacktrace: {
            frames: [
              {
                filename: '/www/src/app/file1.js',
              },
              {
                filename: '/www/src/app/file2.js',
              },
            ],
          },
        },
      ],
    });
    expect(frames).toEqual([
      {
        filename: '/www/src/app/file1.js',
      },
      {
        filename: '/www/src/app/file2.js',
      },
    ]);
  });

  it('no frames', () => {
    const frames = getFramesFromEvent({});
    expect(frames).toEqual(undefined);
  });

  it('broken frames', () => {
    const exceptionNoFrames = getFramesFromEvent({
      exception: {
        values: [],
      },
    });
    const threadsNoFrames = getFramesFromEvent({
      threads: [],
    });
    expect(exceptionNoFrames).toEqual(undefined);
    expect(threadsNoFrames).toEqual(undefined);
  });
});
