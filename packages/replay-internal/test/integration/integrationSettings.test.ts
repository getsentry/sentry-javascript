import { mockSdk } from '../index';

describe('Integration | integrationSettings', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe('blockAllMedia', () => {
    it('sets the correct configuration when `blockAllMedia` is disabled', async () => {
      const { replay } = await mockSdk({ replayOptions: { blockAllMedia: false } });

      expect(replay['_recordingOptions'].blockSelector).toBe('.sentry-block,[data-sentry-block],base[href="/"]');
    });
  });

  describe('replaysSessionSampleRate', () => {
    let mockConsole: jest.SpyInstance<void>;

    beforeEach(() => {
      mockConsole = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    });

    afterEach(() => {
      mockConsole.mockRestore();
    });

    it('works with defining settings in SDK', async () => {
      const { replay } = await mockSdk({ sentryOptions: { replaysSessionSampleRate: 0.5 }, replayOptions: {} });

      expect(replay.getOptions().sessionSampleRate).toBe(0.5);
      expect(mockConsole).toBeCalledTimes(0);
    });

    it('works with defining 0 in SDK', async () => {
      const { replay } = await mockSdk({ sentryOptions: { replaysSessionSampleRate: 0 }, replayOptions: {} });

      expect(replay.getOptions().sessionSampleRate).toBe(0);
      expect(mockConsole).toBeCalledTimes(0);
    });

    it('works with defining a string rate in SDK', async () => {
      const { replay } = await mockSdk({
        sentryOptions: {
          // @ts-expect-error We want to test setting a string here
          replaysSessionSampleRate: '0.5',
        },
        replayOptions: {},
      });

      expect(replay.getOptions().sessionSampleRate).toStrictEqual(0.5);
      expect(mockConsole).toBeCalledTimes(0);
    });
  });

  describe('replaysOnErrorSampleRate', () => {
    let mockConsole: jest.SpyInstance<void>;

    beforeEach(() => {
      mockConsole = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    });

    afterEach(() => {
      mockConsole.mockRestore();
    });

    it('works with defining settings in SDK', async () => {
      const { replay } = await mockSdk({ sentryOptions: { replaysOnErrorSampleRate: 0.5 }, replayOptions: {} });

      expect(replay.getOptions().errorSampleRate).toBe(0.5);
      expect(mockConsole).toBeCalledTimes(0);
    });

    it('works with defining 0 in SDK', async () => {
      const { replay } = await mockSdk({ sentryOptions: { replaysOnErrorSampleRate: 0 }, replayOptions: {} });

      expect(replay.getOptions().errorSampleRate).toBe(0);
      expect(mockConsole).toBeCalledTimes(0);
    });

    it('works with defining a string rate in SDK', async () => {
      const { replay } = await mockSdk({
        sentryOptions: {
          // @ts-expect-error We want to test setting a string here
          replaysOnErrorSampleRate: '0.5',
        },
        replayOptions: {},
      });

      expect(replay.getOptions().errorSampleRate).toStrictEqual(0.5);
      expect(mockConsole).toBeCalledTimes(0);
    });
  });

  describe('all sample rates', () => {
    let mockConsole: jest.SpyInstance<void>;

    beforeEach(() => {
      mockConsole = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    });

    afterEach(() => {
      mockConsole.mockRestore();
    });

    it('logs warning if no sample rates are set', async () => {
      const { replay } = await mockSdk({
        sentryOptions: { replaysOnErrorSampleRate: undefined, replaysSessionSampleRate: undefined },
        replayOptions: {},
      });

      expect(replay.getOptions().sessionSampleRate).toBe(0);
      expect(replay.getOptions().errorSampleRate).toBe(0);
      expect(mockConsole).toBeCalledTimes(1);
    });
  });

  describe('maskAllText', () => {
    it('works with default value', async () => {
      const { replay } = await mockSdk({ replayOptions: {} });

      expect(replay['_recordingOptions'].maskAllText).toBe(true);
    });

    it('works with true', async () => {
      const { replay } = await mockSdk({ replayOptions: { maskAllText: true } });

      expect(replay['_recordingOptions'].maskAllText).toBe(true);
    });

    it('works with false', async () => {
      const { replay } = await mockSdk({ replayOptions: { maskAllText: false } });

      expect(replay['_recordingOptions'].maskAllText).toBe(false);
    });
  });

  describe('_experiments', () => {
    it('works with defining _experiments in integration', async () => {
      const { replay } = await mockSdk({
        replayOptions: { _experiments: { captureExceptions: true } },
        sentryOptions: {},
      });

      expect(replay.getOptions()._experiments).toEqual({ captureExceptions: true });
    });

    it('works without defining _experiments in integration', async () => {
      const { replay } = await mockSdk({
        replayOptions: {},
        sentryOptions: {},
      });

      expect(replay.getOptions()._experiments).toEqual({});
    });
  });
});
