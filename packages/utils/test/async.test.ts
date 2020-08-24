import { forget } from '../src/async';

describe('forget', () => {
  const console = {
    error: jest.fn(),
    log: jest.fn(),
  };

  beforeEach(() => {
    global.console = (console as any) as Console;
  });

  test('logs rejections to console.error', done => {
    const error = new Error();
    forget(Promise.reject(error));

    setImmediate(() => {
      expect(console.error).toHaveBeenCalledWith(error);
      done();
    });
  });
});
