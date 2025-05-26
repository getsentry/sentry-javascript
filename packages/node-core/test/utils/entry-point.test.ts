import { describe, expect, it } from 'vitest';
import type { ProcessArgs, ProcessInterface } from '../../src/utils/entry-point';
import { getEntryPointType, parseProcessPaths } from '../../src/utils/entry-point';

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

describe('getEntryPointType', () => {
  it.each(PROCESS_ARG_TESTS)('parseProcessArgs', (input, output) => {
    const result = parseProcessPaths(input);
    expect(result).toStrictEqual(output);
  });

  it('app absolute', () => {
    const ctx = getEntryPointType({
      cwd: () => __dirname,
      argv: ['/bin/node', __filename],
      execArgv: [],
    });

    expect(ctx).toEqual('app');
  });

  it('app relative', () => {
    const ctx = getEntryPointType({
      cwd: () => __dirname,
      argv: ['/bin/node', 'entry-point.test.ts'],
      execArgv: [],
    });

    expect(ctx).toEqual('app');
  });

  it('import absolute', () => {
    const ctx = getEntryPointType({
      cwd: () => __dirname,
      argv: ['/bin/node', 'app.ts'],
      execArgv: ['--import', __filename],
    });

    expect(ctx).toEqual('import');
  });

  it('import relative', () => {
    const ctx = getEntryPointType({
      cwd: () => __dirname,
      argv: ['/bin/node', 'app.ts'],
      execArgv: ['--import', './entry-point.test.ts'],
    });

    expect(ctx).toEqual('import');
  });

  it('require relative', () => {
    const ctx = getEntryPointType({
      cwd: () => __dirname,
      argv: ['/bin/node', 'app.ts'],
      execArgv: ['--require', './entry-point.test.ts'],
    });

    expect(ctx).toEqual('require');
  });
});
