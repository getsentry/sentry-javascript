// import { GLOBAL_OBJ } from '../src';
import { GLOBAL_OBJ } from '../src';
import {CONSOLE_LEVELS, logger, originalConsoleMethods, consoleSandbox} from '../src/logger';

jest.mock('../src/debug-build', () => {
  return {
    DEBUG_BUILD: true,
  };
});

// jest.createMockFromModule<typeof import('../src/worldwide')>('../src/worldwide');


describe('logger', () => {
  const _console = GLOBAL_OBJ.console;

  beforeEach(() => {
    jest.resetAllMocks();
    logger.enable();
  })

  afterAll(() => {
    jest.clearAllMocks();
    GLOBAL_OBJ.console = _console;
    CONSOLE_LEVELS.forEach(name => {
      originalConsoleMethods[name] = undefined;
    })
  })

  describe('consoleSandbox', () => {
    beforeEach(() => {
      CONSOLE_LEVELS.forEach(name => {
        originalConsoleMethods[name] = jest.fn();
        GLOBAL_OBJ.console[name] = jest.fn();
      })
    })

    it('calls original console methods when used inside of consoleSandbox', () => {
      consoleSandbox(() => {
        console.log('hi');
      })

      expect(originalConsoleMethods.log).toHaveBeenLastCalledWith('hi');
      expect(GLOBAL_OBJ.console.log).not.toHaveBeenCalled();
    })
  })

  describe('logger', () => {
    beforeEach(() => {
      CONSOLE_LEVELS.forEach(name => {
        originalConsoleMethods[name] = jest.fn();
        GLOBAL_OBJ.console[name] = jest.fn();
      })
    })

    it('can be disabled and enabled', () => {
      logger.disable();
      logger.log('hi');
      expect(originalConsoleMethods.log).not.toHaveBeenCalled();
      expect(GLOBAL_OBJ.console.log).not.toHaveBeenCalled();

      logger.enable();
      logger.log('hi');
      expect(originalConsoleMethods.log).toHaveBeenCalledWith('Sentry Logger [log]:', 'hi');
      expect(GLOBAL_OBJ.console.log).not.toHaveBeenCalled();
    })

    it('can disable sandbox', () => {
      // Note that "original" in real world usage would refer to Sentry
      // instrumented functions
      logger.disableSandbox();
      logger.log('hi');
      expect(GLOBAL_OBJ.console.log).toHaveBeenCalledWith('Sentry Logger [log]:', 'hi');
      expect(originalConsoleMethods.log).not.toHaveBeenCalled();

      jest.resetAllMocks();
      logger.enableSandbox();
      logger.log('hi');
      expect(originalConsoleMethods.log).toHaveBeenCalledWith('Sentry Logger [log]:', 'hi');
      expect(GLOBAL_OBJ.console.log).not.toHaveBeenCalled();
    })
  });
})
