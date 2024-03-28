import { createGetModuleFromFilename } from '../src/module';

const getModuleFromFilenameWindows = createGetModuleFromFilename('C:\\Users\\Tim', true);
const getModuleFromFilenamePosix = createGetModuleFromFilename('/Users/Tim');

describe('createGetModuleFromFilename', () => {
  test('Windows', () => {
    expect(getModuleFromFilenameWindows('C:\\Users\\Tim\\node_modules\\some-dep\\module.js')).toEqual(
      'some-dep:module',
    );
    expect(getModuleFromFilenameWindows('C:\\Users\\Tim\\some\\more\\feature.js')).toEqual('some.more:feature');
  });

  test('POSIX', () => {
    expect(getModuleFromFilenamePosix('/Users/Tim/node_modules/some-dep/module.js')).toEqual('some-dep:module');
    expect(getModuleFromFilenamePosix('/Users/Tim/some/more/feature.js')).toEqual('some.more:feature');
    expect(getModuleFromFilenamePosix('/Users/Tim/main.js')).toEqual('main');
  });

  test('.mjs', () => {
    expect(getModuleFromFilenamePosix('/Users/Tim/node_modules/some-dep/module.mjs')).toEqual('some-dep:module');
  });

  test('.cjs', () => {
    expect(getModuleFromFilenamePosix('/Users/Tim/node_modules/some-dep/module.cjs')).toEqual('some-dep:module');
  });

  test('node internal', () => {
    expect(getModuleFromFilenamePosix('node.js')).toEqual('node');
    expect(getModuleFromFilenamePosix('node:internal/process/task_queues')).toEqual('task_queues');
    expect(getModuleFromFilenamePosix('node:internal/timers')).toEqual('timers');
  });
});
