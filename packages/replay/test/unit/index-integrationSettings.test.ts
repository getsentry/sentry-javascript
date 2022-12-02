import { mockSdk } from '@test';

import { Replay } from '../../src';

let replay: Replay;

beforeEach(() => {
  jest.resetModules();
});

describe('blockAllMedia', () => {
  it('sets the correct configuration when `blockAllMedia` is disabled', async () => {
    ({ replay } = await mockSdk({ replayOptions: { blockAllMedia: false } }));

    expect(replay.recordingOptions.blockSelector).toBe('[data-sentry-block]');
  });

  it('sets the correct configuration when `blockSelector` is empty and `blockAllMedia` is enabled', async () => {
    ({ replay } = await mockSdk({ replayOptions: { blockSelector: '' } }));

    expect(replay.recordingOptions.blockSelector).toMatchInlineSnapshot(
      '"img,image,svg,path,rect,area,video,object,picture,embed,map,audio"',
    );
  });

  it('preserves `blockSelector` when `blockAllMedia` is enabled', async () => {
    ({ replay } = await mockSdk({
      replayOptions: { blockSelector: '[data-test-blockSelector]' },
    }));

    expect(replay.recordingOptions.blockSelector).toMatchInlineSnapshot(
      '"[data-test-blockSelector],img,image,svg,path,rect,area,video,object,picture,embed,map,audio"',
    );
  });
});

describe('replaysSampleRate', () => {
  it('works with defining settings in integration', async () => {
    ({ replay } = await mockSdk({ replayOptions: { sessionSampleRate: 0.5 } }));

    expect(replay.options.sessionSampleRate).toBe(0.5);
  });

  it('works with defining settings in SDK', async () => {
    ({ replay } = await mockSdk({ sentryOptions: { replaysSampleRate: 0.5 } }));

    expect(replay.options.sessionSampleRate).toBe(0.5);
  });

  it('SDK option takes precedence', async () => {
    ({ replay } = await mockSdk({
      sentryOptions: { replaysSampleRate: 0.5 },
      replayOptions: { sessionSampleRate: 0.1 },
    }));

    expect(replay.options.sessionSampleRate).toBe(0.5);
  });
});

describe('replaysOnErrorSampleRate', () => {
  it('works with defining settings in integration', async () => {
    ({ replay } = await mockSdk({ replayOptions: { errorSampleRate: 0.5 } }));

    expect(replay.options.errorSampleRate).toBe(0.5);
  });

  it('works with defining settings in SDK', async () => {
    ({ replay } = await mockSdk({ sentryOptions: { replaysOnErrorSampleRate: 0.5 } }));

    expect(replay.options.errorSampleRate).toBe(0.5);
  });

  it('SDK option takes precedence', async () => {
    ({ replay } = await mockSdk({
      sentryOptions: { replaysOnErrorSampleRate: 0.5 },
      replayOptions: { errorSampleRate: 0.1 },
    }));

    expect(replay.options.errorSampleRate).toBe(0.5);
  });
});

describe('maskAllText', () => {
  it('works with default value', async () => {
    ({ replay } = await mockSdk({ replayOptions: {} }));

    // Default is true
    expect(replay.recordingOptions.maskTextSelector).toBe('*');
  });

  it('works with true', async () => {
    ({ replay } = await mockSdk({ replayOptions: { maskAllText: true } }));

    expect(replay.recordingOptions.maskTextSelector).toBe('*');
  });

  it('works with false', async () => {
    ({ replay } = await mockSdk({ replayOptions: { maskAllText: false } }));

    expect(replay.recordingOptions.maskTextSelector).toBe(undefined);
  });

  it('overwrites custom maskTextSelector option', async () => {
    ({ replay } = await mockSdk({ replayOptions: { maskAllText: true, maskTextSelector: '[custom]' } }));

    expect(replay.recordingOptions.maskTextSelector).toBe('*');
  });
});
