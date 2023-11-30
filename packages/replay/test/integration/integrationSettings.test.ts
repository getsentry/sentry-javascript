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

    it('sets the correct configuration when `blockSelector` is empty and `blockAllMedia` is enabled', async () => {
      const { replay } = await mockSdk({ replayOptions: { blockSelector: '' } });

      expect(replay['_recordingOptions'].blockSelector).toMatchInlineSnapshot(
        '",.sentry-block,[data-sentry-block],base[href="/"],img,image,svg,video,object,picture,embed,map,audio,link[rel="icon"],link[rel="apple-touch-icon"]"',
      );
    });

    it('preserves `blockSelector` when `blockAllMedia` is enabled', async () => {
      const { replay } = await mockSdk({
        replayOptions: { blockSelector: '[data-test-blockSelector]' },
      });

      expect(replay['_recordingOptions'].blockSelector).toMatchInlineSnapshot(
        '"[data-test-blockSelector],.sentry-block,[data-sentry-block],base[href="/"],img,image,svg,video,object,picture,embed,map,audio,link[rel="icon"],link[rel="apple-touch-icon"]"',
      );
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

    it('works with defining settings in integration', async () => {
      const { replay } = await mockSdk({
        replayOptions: { sessionSampleRate: 0.5 },
        sentryOptions: { replaysSessionSampleRate: undefined },
      });

      expect(replay.getOptions().sessionSampleRate).toBe(0.5);
      expect(mockConsole).toHaveBeenCalledTimes(1);
    });

    it('works with defining 0 in integration but logs warnings', async () => {
      const { replay } = await mockSdk({
        replayOptions: { sessionSampleRate: 0 },
        sentryOptions: { replaysSessionSampleRate: undefined },
      });

      expect(replay.getOptions().sessionSampleRate).toBe(0);
      expect(mockConsole).toHaveBeenCalledTimes(1);
    });

    it('works with defining settings in SDK', async () => {
      const { replay } = await mockSdk({ sentryOptions: { replaysSessionSampleRate: 0.5 }, replayOptions: {} });

      expect(replay.getOptions().sessionSampleRate).toBe(0.5);
      expect(mockConsole).toHaveBeenCalledTimes(0);
    });

    it('works with defining 0 in SDK', async () => {
      const { replay } = await mockSdk({ sentryOptions: { replaysSessionSampleRate: 0 }, replayOptions: {} });

      expect(replay.getOptions().sessionSampleRate).toBe(0);
      expect(mockConsole).toHaveBeenCalledTimes(0);
    });

    it('SDK option takes precedence', async () => {
      const { replay } = await mockSdk({
        sentryOptions: { replaysSessionSampleRate: 0.5 },
        replayOptions: { sessionSampleRate: 0.1 },
      });

      expect(replay.getOptions().sessionSampleRate).toBe(0.5);
      expect(mockConsole).toHaveBeenCalledTimes(1);
    });

    it('SDK option takes precedence even when 0', async () => {
      const { replay } = await mockSdk({
        sentryOptions: { replaysSessionSampleRate: 0 },
        replayOptions: { sessionSampleRate: 0.1 },
      });

      expect(replay.getOptions().sessionSampleRate).toBe(0);
      expect(mockConsole).toHaveBeenCalledTimes(1);
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

    it('works with defining settings in integration', async () => {
      const { replay } = await mockSdk({
        replayOptions: { errorSampleRate: 0.5 },
        sentryOptions: { replaysOnErrorSampleRate: undefined },
      });

      expect(replay.getOptions().errorSampleRate).toBe(0.5);
      expect(mockConsole).toHaveBeenCalledTimes(1);
    });

    it('works with defining 0 in integration', async () => {
      const { replay } = await mockSdk({
        replayOptions: { errorSampleRate: 0 },
        sentryOptions: { replaysOnErrorSampleRate: undefined },
      });

      expect(replay.getOptions().errorSampleRate).toBe(0);
      expect(mockConsole).toHaveBeenCalledTimes(1);
    });

    it('works with defining settings in SDK', async () => {
      const { replay } = await mockSdk({ sentryOptions: { replaysOnErrorSampleRate: 0.5 }, replayOptions: {} });

      expect(replay.getOptions().errorSampleRate).toBe(0.5);
      expect(mockConsole).toHaveBeenCalledTimes(0);
    });

    it('works with defining 0 in SDK', async () => {
      const { replay } = await mockSdk({ sentryOptions: { replaysOnErrorSampleRate: 0 }, replayOptions: {} });

      expect(replay.getOptions().errorSampleRate).toBe(0);
      expect(mockConsole).toHaveBeenCalledTimes(0);
    });

    it('SDK option takes precedence', async () => {
      const { replay } = await mockSdk({
        sentryOptions: { replaysOnErrorSampleRate: 0.5 },
        replayOptions: { errorSampleRate: 0.1 },
      });

      expect(replay.getOptions().errorSampleRate).toBe(0.5);
      expect(mockConsole).toHaveBeenCalledTimes(1);
    });

    it('SDK option takes precedence even when 0', async () => {
      const { replay } = await mockSdk({
        sentryOptions: { replaysOnErrorSampleRate: 0 },
        replayOptions: { errorSampleRate: 0.1 },
      });

      expect(replay.getOptions().errorSampleRate).toBe(0);
      expect(mockConsole).toHaveBeenCalledTimes(1);
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
      expect(mockConsole).toHaveBeenCalledTimes(1);
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

  describe('maskTextSelector', () => {
    it('can have custom mask selector', async () => {
      const { replay } = await mockSdk({ replayOptions: { maskTextSelector: '[custom]' } });

      expect(replay['_recordingOptions'].maskTextSelector).toBe('[custom],.sentry-mask,[data-sentry-mask]');
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
