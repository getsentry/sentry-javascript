import { platform } from 'os';
// Contains unit tests for some of the C++ bindings. These functions
// are exported on the private bindings object, so we can test them and
// they should not be used outside of this file.
import { PrivateCpuProfilerBindings } from '../src/cpu_profiler';

const cases = [
  ['/Users/jonas/code/node_modules/@scope/package/file.js', '@scope.package:file'],
  ['/Users/jonas/code/node_modules/package/dir/file.js', 'package.dir:file'],
  ['/Users/jonas/code/node_modules/package/file.js', 'package:file'],
  ['/Users/jonas/code/src/file.js', 'Users.jonas.code.src:file'],

  //   Preserves non .js extensions
  ['/Users/jonas/code/src/file.ts', 'Users.jonas.code.src:file.ts'],
  //   No extension
  ['/Users/jonas/code/src/file', 'Users.jonas.code.src:file'],
  //   Edge cases that shouldn't happen in practice, but try and handle them so we don't crash
  ['/Users/jonas/code/src/file.js', 'Users.jonas.code.src:file'],
  ['', ''],
];

describe('GetFrameModule', () => {
  it.each(
    platform() === 'win32'
      ? cases.map(([abs_path, expected]) => [abs_path ? `C:${abs_path.replace(/\//g, '\\')}` : '', expected])
      : cases,
  )('%s => %s', (abs_path: string, expected: string) => {
    expect(PrivateCpuProfilerBindings.getFrameModule(abs_path)).toBe(expected);
  });
});
