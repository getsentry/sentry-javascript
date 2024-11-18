import type { ProcessInterface, ProcessArgs } from '../../src/utils/execution-context';
import { getExecutionContext, parseProcessPaths } from '../../src/utils/execution-context';
import { defaultStackParser } from '../../src';

const PROCESS_ARG_TESTS: [ProcessInterface, ProcessArgs][] = [
  [
    { cwd: () => '/user/tim/docs', argv: ['/bin/node', 'app.js'], execArgv: ['--import', './something.js'] },
    { appPath: '/user/tim/docs/app.js', importPaths: ['/user/tim/docs/something.js'], requirePaths: [] },
  ],
  [
    {
      cwd: () => '/user/tim/docs',
      argv: ['/bin/node', 'app.js'],
      execArgv: ['--import', './something.js', '--import=./else.js'],
    },
    {
      appPath: '/user/tim/docs/app.js',
      importPaths: ['/user/tim/docs/something.js', '/user/tim/docs/else.js'],
      requirePaths: [],
    },
  ],
  [
    {
      cwd: () => '/user/tim/docs',
      argv: ['/bin/node', 'app.js'],
      execArgv: ['--require', './something.js', '--import=else.js'],
    },
    {
      appPath: '/user/tim/docs/app.js',
      importPaths: ['/user/tim/docs/else.js'],
      requirePaths: ['/user/tim/docs/something.js'],
    },
  ],
  [
    {
      cwd: () => '/user/tim/docs',
      argv: ['/bin/node', 'app.js'],
      execArgv: ['--require=here/something.js'],
    },
    {
      appPath: '/user/tim/docs/app.js',
      importPaths: [],
      requirePaths: ['/user/tim/docs/here/something.js'],
    },
  ],
];

describe('getExecutionContext', () => {
  it.each(PROCESS_ARG_TESTS)('parseProcessArgs', (input, output) => {
    const result = parseProcessPaths(input);
    expect(result).toStrictEqual(output);
  });

  it('app absolute', () => {
    const ctx = getExecutionContext(defaultStackParser, {
      cwd: () => __dirname,
      argv: ['/bin/node', __filename],
      execArgv: [],
    });

    expect(ctx).toEqual('app');
  });

  it('app relative', () => {
    const ctx = getExecutionContext(defaultStackParser, {
      cwd: () => __dirname,
      argv: ['/bin/node', 'execution-context.test.ts'],
      execArgv: [],
    });

    expect(ctx).toEqual('app');
  });

  it('import absolute', () => {
    const ctx = getExecutionContext(defaultStackParser, {
      cwd: () => __dirname,
      argv: ['/bin/node', 'app.ts'],
      execArgv: ['--import', __filename],
    });

    expect(ctx).toEqual('import');
  });

  it('import relative', () => {
    const ctx = getExecutionContext(defaultStackParser, {
      cwd: () => __dirname,
      argv: ['/bin/node', 'app.ts'],
      execArgv: ['--import', './execution-context.test.ts'],
    });

    expect(ctx).toEqual('import');
  });

  it('require relative', () => {
    const ctx = getExecutionContext(defaultStackParser, {
      cwd: () => __dirname,
      argv: ['/bin/node', 'app.ts'],
      execArgv: ['--require', './execution-context.test.ts'],
    });

    expect(ctx).toEqual('require');
  });
});
