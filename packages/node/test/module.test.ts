import { getModuleFromFilename } from '../src/module';

describe('getModuleFromFilename', () => {
  test('Windows', () => {
    expect(
      getModuleFromFilename('C:\\Users\\Tim\\node_modules\\some-dep\\module.js', 'C:\\Users\\Tim\\', true),
    ).toEqual('some-dep:module');

    expect(getModuleFromFilename('C:\\Users\\Tim\\some\\more\\feature.js', 'C:\\Users\\Tim\\', true)).toEqual(
      'some.more:feature',
    );
  });

  test('POSIX', () => {
    expect(getModuleFromFilename('/Users/Tim/node_modules/some-dep/module.js', '/Users/Tim/')).toEqual(
      'some-dep:module',
    );

    expect(getModuleFromFilename('/Users/Tim/some/more/feature.js', '/Users/Tim/')).toEqual('some.more:feature');
    expect(getModuleFromFilename('/Users/Tim/main.js', '/Users/Tim/')).toEqual('main');
  });

  test('.mjs', () => {
    expect(getModuleFromFilename('/Users/Tim/node_modules/some-dep/module.mjs', '/Users/Tim/')).toEqual(
      'some-dep:module',
    );
  });

  test('.cjs', () => {
    expect(getModuleFromFilename('/Users/Tim/node_modules/some-dep/module.cjs', '/Users/Tim/')).toEqual(
      'some-dep:module',
    );
  });

  test('node internal', () => {
    expect(getModuleFromFilename('node.js', '/Users/Tim/')).toEqual('node');
    expect(getModuleFromFilename('node:internal/process/task_queues', '/Users/Tim/')).toEqual('task_queues');
    expect(getModuleFromFilename('node:internal/timers', '/Users/Tim/')).toEqual('timers');
  });
});
