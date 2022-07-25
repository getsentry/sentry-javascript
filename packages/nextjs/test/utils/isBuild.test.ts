import { isBuild } from '../../src/utils/isBuild';

let originalEnv: typeof process.env;
let originalArgv: typeof process.argv;

function assertNoMagicValues(): void {
  if (Object.keys(process.env).includes('SENTRY_BUILD_PHASE') || process.argv.includes('build')) {
    throw new Error('Not starting test with a clean setup');
  }
}

describe('isBuild()', () => {
  beforeEach(() => {
    assertNoMagicValues();
    originalEnv = { ...process.env };
    originalArgv = [...process.argv];
  });

  afterEach(() => {
    process.env = originalEnv;
    process.argv = originalArgv;
    assertNoMagicValues();
  });

  it("detects 'build' in argv", () => {
    // the result of calling `next build`
    process.argv = ['/abs/path/to/node', '/abs/path/to/nextjs/excecutable', 'build'];
    expect(isBuild()).toBe(true);
  });

  it("sets env var when 'build' in argv", () => {
    // the result of calling `next build`
    process.argv = ['/abs/path/to/node', '/abs/path/to/nextjs/excecutable', 'build'];
    isBuild();
    expect(Object.keys(process.env).includes('SENTRY_BUILD_PHASE')).toBe(true);
  });

  it("does not set env var when 'build' not in argv", () => {
    isBuild();
    expect(Object.keys(process.env).includes('SENTRY_BUILD_PHASE')).toBe(false);
  });

  it('detects env var', () => {
    process.env.SENTRY_BUILD_PHASE = 'true';
    expect(isBuild()).toBe(true);
  });

  it("returns false when 'build' not in `argv` and env var not present", () => {
    expect(isBuild()).toBe(false);
  });
});
