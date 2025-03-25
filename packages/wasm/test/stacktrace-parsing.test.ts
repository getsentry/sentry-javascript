import { describe, it, expect } from 'vitest';
import { patchFrames } from '../src/index';

describe('patchFrames()', () => {
  it('should correctly extract instruction addresses', () => {
    const frames = [
      {
        colno: 5,
        filename: 'http://localhost:8001/main.js',
        function: 'run',
        in_app: true,
        lineno: 7101,
      },
      {
        colno: 71,
        filename: 'http://localhost:8001/main.js',
        function: 'doRun',
        in_app: true,
        lineno: 7084,
      },
      {
        colno: 9,
        filename: 'http://localhost:8001/main.html',
        function: 'Object.onRuntimeInitialized',
        in_app: true,
        lineno: 39,
      },
      {
        colno: 11,
        filename: 'http://localhost:8001/main.html',
        function: 'captureError',
        in_app: true,
        lineno: 27,
      },
      {
        colno: 22,
        filename: 'http://localhost:8001/main.html',
        function: 'myFunctionVectorOutOfBounds',
        in_app: true,
        lineno: 18,
      },
      {
        colno: 27,
        filename: 'http://localhost:8001/main.js',
        function: 'ClassHandle.MyClass$getAt [as getAt]',
        in_app: true,
        lineno: 2201,
      },
      {
        filename:
          'int) const, int, MyClass const*, int>::invoke(int (MyClass::* const&)(int) const, MyClass const*, int) (http://localhost:8001/main.wasm:wasm-function[152]:0x47df',
        function: 'emscripten::internal::MethodInvoker<int (MyClass::*)',
        in_app: true,
      },
      {
        filename: 'int) const (http://localhost:8001/main.wasm:wasm-function[182]:0x540b',
        function: 'MyClass::getAt',
        in_app: true,
      },
      {
        filename: 'int) const (http://localhost:8001/main.wasm:wasm-function[186]:0x5637',
        function: 'MyClass::foo',
        in_app: true,
      },
      {
        filename: 'int) const (http://localhost:8001/main.wasm:wasm-function[190]:0x5aeb',
        function: 'MyClass::bar',
        in_app: true,
      },
      {
        filename: 'http://localhost:8001/main.wasm:wasm-function[190]:0x5aeb',
        function: 'MyClass::bar',
        in_app: true,
      },
    ];

    patchFrames(frames);

    expect(frames).toStrictEqual([
      {
        colno: 5,
        filename: 'http://localhost:8001/main.js',
        function: 'run',
        in_app: true,
        lineno: 7101,
      },
      {
        colno: 71,
        filename: 'http://localhost:8001/main.js',
        function: 'doRun',
        in_app: true,
        lineno: 7084,
      },
      {
        colno: 9,
        filename: 'http://localhost:8001/main.html',
        function: 'Object.onRuntimeInitialized',
        in_app: true,
        lineno: 39,
      },
      {
        colno: 11,
        filename: 'http://localhost:8001/main.html',
        function: 'captureError',
        in_app: true,
        lineno: 27,
      },
      {
        colno: 22,
        filename: 'http://localhost:8001/main.html',
        function: 'myFunctionVectorOutOfBounds',
        in_app: true,
        lineno: 18,
      },
      {
        colno: 27,
        filename: 'http://localhost:8001/main.js',
        function: 'ClassHandle.MyClass$getAt [as getAt]',
        in_app: true,
        lineno: 2201,
      },
      {
        filename: 'http://localhost:8001/main.wasm',
        function: 'emscripten::internal::MethodInvoker<int (MyClass::*)',
        in_app: true,
        instruction_addr: '0x47df',
        platform: 'native',
      },
      {
        filename: 'http://localhost:8001/main.wasm',
        function: 'MyClass::getAt',
        in_app: true,
        instruction_addr: '0x540b',
        platform: 'native',
      },
      {
        filename: 'http://localhost:8001/main.wasm',
        function: 'MyClass::foo',
        in_app: true,
        instruction_addr: '0x5637',
        platform: 'native',
      },
      {
        filename: 'http://localhost:8001/main.wasm',
        function: 'MyClass::bar',
        in_app: true,
        instruction_addr: '0x5aeb',
        platform: 'native',
      },
      {
        filename: 'http://localhost:8001/main.wasm',
        function: 'MyClass::bar',
        in_app: true,
        instruction_addr: '0x5aeb',
        platform: 'native',
      },
    ]);
  });
});
