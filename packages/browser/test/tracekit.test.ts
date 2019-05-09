import { expect } from 'chai';

import { _computeStackTrace } from '../src/tracekit';

const CHROME73_NATIVE_CODE_EXCEPTION = {
  stack: `Error: test
  at fooIterator (http://192.168.20.143:5000/test:20:17)
  at Array.map (<anonymous>)
  at foo (http://192.168.20.143:5000/test:19:19)
  at http://192.168.20.143:5000/test:24:7`,
};

const FIREFOX66_NATIVE_CODE_EXCEPTION = {
  stack: `fooIterator@http://192.168.20.143:5000/test:20:17
  foo@http://192.168.20.143:5000/test:19:19
  @http://192.168.20.143:5000/test:24:7`,
};

const SAFARI12_NATIVE_CODE_EXCEPTION = {
  stack: `fooIterator@http://192.168.20.143:5000/test:20:26
  map@[native code]
  foo@http://192.168.20.143:5000/test:19:22
  global code@http://192.168.20.143:5000/test:24:10`,
};

const EDGE44_NATIVE_CODE_EXCEPTION = {
  stack: `Error: test
  at fooIterator (http://192.168.20.143:5000/test:20:11)
  at Array.prototype.map (native code)
  at foo (http://192.168.20.143:5000/test:19:9)
  at Global code (http://192.168.20.143:5000/test:24:7)`,
};

describe('Tracekit', () => {
  describe('computeStackTrace', () => {
    it('no exception', () => {
      const stacktrace = _computeStackTrace._computeStackTraceFromStackProp(undefined);
      expect(stacktrace).equal(null);
    });

    it('no stack', () => {
      const stacktrace = _computeStackTrace._computeStackTraceFromStackProp({});
      expect(stacktrace).equal(null);
    });

    it('chrome73', () => {
      const stacktrace = _computeStackTrace._computeStackTraceFromStackProp(CHROME73_NATIVE_CODE_EXCEPTION);

      expect(stacktrace.stack).deep.equal([
        {
          args: [],
          column: 17,
          context: null,
          func: 'fooIterator',
          line: 20,
          url: 'http://192.168.20.143:5000/test',
        },
        {
          args: [],
          column: null,
          context: null,
          func: 'Array.map',
          line: null,
          url: '<anonymous>',
        },
        {
          args: [],
          column: 19,
          context: null,
          func: 'foo',
          line: 19,
          url: 'http://192.168.20.143:5000/test',
        },
        {
          args: [],
          column: 7,
          context: null,
          func: '?',
          line: 24,
          url: 'http://192.168.20.143:5000/test',
        },
      ]);
    });

    it('firefox66', () => {
      const stacktrace = _computeStackTrace._computeStackTraceFromStackProp(FIREFOX66_NATIVE_CODE_EXCEPTION);

      expect(stacktrace.stack).deep.equal([
        {
          args: [],
          column: 17,
          context: null,
          func: 'fooIterator',
          line: 20,
          url: 'http://192.168.20.143:5000/test',
        },
        {
          args: [],
          column: 19,
          context: null,
          func: 'foo',
          line: 19,
          url: 'http://192.168.20.143:5000/test',
        },
        {
          args: [],
          column: 7,
          context: null,
          func: '?',
          line: 24,
          url: 'http://192.168.20.143:5000/test',
        },
      ]);
    });

    it('safari12', () => {
      const stacktrace = _computeStackTrace._computeStackTraceFromStackProp(SAFARI12_NATIVE_CODE_EXCEPTION);

      expect(stacktrace.stack).deep.equal([
        {
          args: [],
          column: 26,
          context: null,
          func: 'fooIterator',
          line: 20,
          url: 'http://192.168.20.143:5000/test',
        },
        {
          args: [],
          column: null,
          context: null,
          func: 'map',
          line: null,
          url: '[native code]',
        },
        {
          args: [],
          column: 22,
          context: null,
          func: 'foo',
          line: 19,
          url: 'http://192.168.20.143:5000/test',
        },
        {
          args: [],
          column: 10,
          context: null,
          func: 'global code',
          line: 24,
          url: 'http://192.168.20.143:5000/test',
        },
      ]);
    });

    it('edge44', () => {
      const stacktrace = _computeStackTrace._computeStackTraceFromStackProp(EDGE44_NATIVE_CODE_EXCEPTION);

      expect(stacktrace.stack).deep.equal([
        {
          args: [],
          column: 11,
          context: null,
          func: 'fooIterator',
          line: 20,
          url: 'http://192.168.20.143:5000/test',
        },
        {
          args: [],
          column: null,
          context: null,
          func: 'Array.prototype.map',
          line: null,
          url: 'native code',
        },
        {
          args: [],
          column: 9,
          context: null,
          func: 'foo',
          line: 19,
          url: 'http://192.168.20.143:5000/test',
        },
        {
          args: [],
          column: 7,
          context: null,
          func: 'Global code',
          line: 24,
          url: 'http://192.168.20.143:5000/test',
        },
      ]);
    });
  });
});
