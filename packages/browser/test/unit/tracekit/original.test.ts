import { expect } from 'chai';

import { computeStackTrace } from '../../../src/tracekit';
import {
  ANDROID_REACT_NATIVE,
  ANDROID_REACT_NATIVE_HERMES,
  ANDROID_REACT_NATIVE_PROD,
  CHROME_15,
  CHROME_36,
  CHROME_48_BLOB,
  CHROME_48_EVAL,
  CHROME_XX_WEBPACK,
  FIREFOX_3,
  FIREFOX_7,
  FIREFOX_14,
  FIREFOX_31,
  FIREFOX_43_EVAL,
  FIREFOX_44_NS_EXCEPTION,
  FIREFOX_50_RESOURCE_URL,
  IE_10,
  IE_11,
  IE_11_EVAL,
  OPERA_10,
  OPERA_11,
  OPERA_12,
  OPERA_25,
  PHANTOMJS_1_19,
  SAFARI_6,
  SAFARI_7,
  SAFARI_8,
  SAFARI_8_EVAL,
} from './originalfixtures';

describe('Tracekit - Original Tests', () => {
  it('should parse Safari 6 error', () => {
    const stackFrames = computeStackTrace(SAFARI_6);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(4);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 48,
      column: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'dumpException3',
      args: [],
      line: 52,
      column: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'onclick',
      args: [],
      line: 82,
      column: null,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: '[native code]',
      func: '?',
      args: [],
      line: null,
      column: null,
    });
  });

  it('should parse Safari 7 error', () => {
    const stackFrames = computeStackTrace(SAFARI_7);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 48,
      column: 22,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 52,
      column: 15,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 108,
      column: 107,
    });
  });

  it('should parse Safari 8 error', () => {
    const stackFrames = computeStackTrace(SAFARI_8);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 47,
      column: 22,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 52,
      column: 15,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 108,
      column: 23,
    });
  });

  it('should parse Safari 8 eval error', () => {
    // TODO: Take into account the line and column properties on the error object and use them for the first stack trace.
    const stackFrames = computeStackTrace(SAFARI_8_EVAL);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: '[native code]',
      func: 'eval',
      args: [],
      line: null,
      column: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 58,
      column: 21,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 109,
      column: 91,
    });
  });

  it('should parse Firefox 3 error', () => {
    const stackFrames = computeStackTrace(FIREFOX_3);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(7);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://127.0.0.1:8000/js/stacktrace.js',
      func: '?',
      args: [],
      line: 44,
      column: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://127.0.0.1:8000/js/stacktrace.js',
      func: '?',
      args: ['null'],
      line: 31,
      column: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://127.0.0.1:8000/js/stacktrace.js',
      func: 'printStackTrace',
      args: [],
      line: 18,
      column: null,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'http://127.0.0.1:8000/js/file.js',
      func: 'bar',
      args: ['1'],
      line: 13,
      column: null,
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'http://127.0.0.1:8000/js/file.js',
      func: 'bar',
      args: ['2'],
      line: 16,
      column: null,
    });
    expect(stackFrames.stack[5]).to.deep.equal({
      url: 'http://127.0.0.1:8000/js/file.js',
      func: 'foo',
      args: [],
      line: 20,
      column: null,
    });
    expect(stackFrames.stack[6]).to.deep.equal({
      url: 'http://127.0.0.1:8000/js/file.js',
      func: '?',
      args: [],
      line: 24,
      column: null,
    });
  });

  it('should parse Firefox 7 error', () => {
    const stackFrames = computeStackTrace(FIREFOX_7);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(7);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'file:///G:/js/stacktrace.js',
      func: '?',
      args: [],
      line: 44,
      column: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'file:///G:/js/stacktrace.js',
      func: '?',
      args: ['null'],
      line: 31,
      column: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'file:///G:/js/stacktrace.js',
      func: 'printStackTrace',
      args: [],
      line: 18,
      column: null,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'file:///G:/js/file.js',
      func: 'bar',
      args: ['1'],
      line: 13,
      column: null,
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'file:///G:/js/file.js',
      func: 'bar',
      args: ['2'],
      line: 16,
      column: null,
    });
    expect(stackFrames.stack[5]).to.deep.equal({
      url: 'file:///G:/js/file.js',
      func: 'foo',
      args: [],
      line: 20,
      column: null,
    });
    expect(stackFrames.stack[6]).to.deep.equal({
      url: 'file:///G:/js/file.js',
      func: '?',
      args: [],
      line: 24,
      column: null,
    });
  });

  it('should parse Firefox 14 error', () => {
    const stackFrames = computeStackTrace(FIREFOX_14);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 48,
      column: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'dumpException3',
      args: [],
      line: 52,
      column: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'onclick',
      args: [],
      line: 1,
      column: null,
    });
  });

  it('should parse Firefox 31 error', () => {
    const stackFrames = computeStackTrace(FIREFOX_31);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 41,
      column: 13,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 1,
      column: 1,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '.plugin/e.fn[c]/<',
      args: [],
      line: 1,
      column: 1,
    });
  });

  it('should parse Firefox 44 ns exceptions', () => {
    const stackFrames = computeStackTrace(FIREFOX_44_NS_EXCEPTION);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(4);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '[2]</Bar.prototype._baz/</<',
      args: [],
      line: 703,
      column: 28,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'file:///path/to/file.js',
      func: 'App.prototype.foo',
      args: [],
      line: 15,
      column: 2,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'file:///path/to/file.js',
      func: 'bar',
      args: [],
      line: 20,
      column: 3,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'file:///path/to/index.html',
      func: '?',
      args: [],
      line: 23,
      column: 1,
    });
  });

  it('should parse Chrome error with no location', () => {
    const stackFrames = computeStackTrace({ message: 'foo', name: 'bar', stack: 'error\n at Array.forEach (native)' });
    expect(stackFrames.stack.length).to.be.equal(1);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'native',
      func: 'Array.forEach',
      args: ['native'],
      line: null,
      column: null,
    });
  });

  it('should parse Chrome 15 error', () => {
    const stackFrames = computeStackTrace(CHROME_15);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(4);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 13,
      column: 17,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 16,
      column: 5,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 20,
      column: 5,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 24,
      column: 4,
    });
  });

  it('should parse Chrome 36 error with port numbers', () => {
    const stackFrames = computeStackTrace(CHROME_36);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'dumpExceptionError',
      args: [],
      line: 41,
      column: 27,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'HTMLButtonElement.onclick',
      args: [],
      line: 107,
      column: 146,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'I.e.fn.(anonymous function) [as index]',
      args: [],
      line: 10,
      column: 3651,
    });
  });

  it('should parse Chrome error with webpack URLs', () => {
    const stackFrames = computeStackTrace(CHROME_XX_WEBPACK);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(4);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'webpack:///./src/components/test/test.jsx?',
      func: 'TESTTESTTEST.eval',
      args: [],
      line: 295,
      column: 108,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'webpack:///./src/components/test/test.jsx?',
      func: 'TESTTESTTEST.render',
      args: [],
      line: 272,
      column: 32,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'webpack:///./~/react-transform-catch-errors/lib/index.js?',
      func: 'TESTTESTTEST.tryRender',
      args: [],
      line: 34,
      column: 31,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'webpack:///./~/react-proxy/modules/createPrototypeProxy.js?',
      func: 'TESTTESTTEST.proxiedMethod',
      args: [],
      line: 44,
      column: 30,
    });
  });

  it('should parse nested eval() from Chrome', () => {
    const stackFrames = computeStackTrace(CHROME_48_EVAL);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(5);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'baz',
      args: [],
      line: 21,
      column: 17,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'foo',
      args: [],
      line: 21,
      column: 17,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'eval',
      args: [],
      line: 21,
      column: 17,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'Object.speak',
      args: [],
      line: 21,
      column: 17,
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: '?',
      args: [],
      line: 31,
      column: 13,
    });
  });

  it('should parse Chrome error with blob URLs', () => {
    const stackFrames = computeStackTrace(CHROME_48_BLOB);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(7);
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
      func: 's',
      args: [],
      line: 31,
      column: 29146,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
      func: 'Object.d [as add]',
      args: [],
      line: 31,
      column: 30039,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'blob:http%3A//localhost%3A8080/d4eefe0f-361a-4682-b217-76587d9f712a',
      func: '?',
      args: [],
      line: 15,
      column: 10978,
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
      func: '?',
      args: [],
      line: 1,
      column: 6911,
    });
    expect(stackFrames.stack[5]).to.deep.equal({
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
      func: 'n.fire',
      args: [],
      line: 7,
      column: 3019,
    });
    expect(stackFrames.stack[6]).to.deep.equal({
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
      func: 'n.handle',
      args: [],
      line: 7,
      column: 2863,
    });
  });

  it('should parse IE 10 error', () => {
    const stackFrames = computeStackTrace(IE_10);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    // TODO: func should be normalized
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'Anonymous function',
      args: [],
      line: 48,
      column: 13,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 46,
      column: 9,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 82,
      column: 1,
    });
  });

  it('should parse IE 11 error', () => {
    const stackFrames = computeStackTrace(IE_11);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    // TODO: func should be normalized
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'Anonymous function',
      args: [],
      line: 47,
      column: 21,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 45,
      column: 13,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 108,
      column: 1,
    });
  });

  it('should parse IE 11 eval error', () => {
    const stackFrames = computeStackTrace(IE_11_EVAL);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'eval code',
      func: 'eval code',
      args: [],
      line: 1,
      column: 1,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 58,
      column: 17,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 109,
      column: 1,
    });
  });

  it('should parse Opera 10 error', () => {
    const stackFrames = computeStackTrace(OPERA_10);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(7);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 42,
      column: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 27,
      column: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'printStackTrace',
      args: [],
      line: 18,
      column: null,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 4,
      column: null,
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 7,
      column: null,
    });
    expect(stackFrames.stack[5]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 11,
      column: null,
    });
    expect(stackFrames.stack[6]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 15,
      column: null,
    });
  });

  it('should parse Opera 11 error', () => {
    const stackFrames = computeStackTrace(OPERA_11);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(7);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'createException',
      args: [],
      line: 42,
      column: 12,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'run',
      args: ['ex'],
      line: 27,
      column: 8,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'printStackTrace',
      args: ['options'],
      line: 18,
      column: 4,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: ['n'],
      line: 4,
      column: 5,
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: ['n'],
      line: 7,
      column: 4,
    });
    expect(stackFrames.stack[5]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 11,
      column: 4,
    });
    expect(stackFrames.stack[6]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 15,
      column: 3,
    });
  });

  it('should parse Opera 12 error', () => {
    // TODO: Improve anonymous function name.
    const stackFrames = computeStackTrace(OPERA_12);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://localhost:8000/ExceptionLab.html',
      func: '<anonymous function>',
      args: ['x'],
      line: 48,
      column: 12,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://localhost:8000/ExceptionLab.html',
      func: 'dumpException3',
      args: [],
      line: 46,
      column: 8,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://localhost:8000/ExceptionLab.html',
      func: '<anonymous function>',
      args: ['event'],
      line: 1,
      column: 0,
    });
  });

  it('should parse Opera 25 error', () => {
    const stackFrames = computeStackTrace(OPERA_25);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 47,
      column: 22,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 52,
      column: 15,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 108,
      column: 168,
    });
  });

  it('should parse PhantomJS 1.19 error', () => {
    const stackFrames = computeStackTrace(PHANTOMJS_1_19);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'file:///path/to/file.js',
      func: '?',
      args: [],
      line: 878,
      column: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 4283,
      column: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 4287,
      column: null,
    });
  });

  it('should parse Firefox errors with resource: URLs', () => {
    const stackFrames = computeStackTrace(FIREFOX_50_RESOURCE_URL);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'resource://path/data/content/bundle.js',
      func: 'render',
      args: [],
      line: 5529,
      column: 16,
    });
  });

  it('should parse Firefox errors with eval URLs', () => {
    const stackFrames = computeStackTrace(FIREFOX_43_EVAL);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(5);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'baz',
      args: [],
      line: 26,
      column: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'foo',
      args: [],
      line: 26,
      column: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'eval',
      args: [],
      line: 26,
      column: null,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'speak',
      args: [],
      line: 26,
      column: 17,
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: '?',
      args: [],
      line: 33,
      column: 9,
    });
  });

  it('should parse React Native errors on Android', () => {
    const stackFrames = computeStackTrace(ANDROID_REACT_NATIVE);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(8);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: '/home/username/sample-workspace/sampleapp.collect.react/src/components/GpsMonitorScene.js',
      func: 'render',
      args: [],
      line: 78,
      column: 24,
    });
    expect(stackFrames.stack[7]).to.deep.equal({
      url:
        '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/native/ReactNativeBaseComponent.js',
      func: 'this',
      args: [],
      line: 74,
      column: 41,
    });
  });

  it('should parse React Native errors on Android Production', () => {
    const stackFrames = computeStackTrace(ANDROID_REACT_NATIVE_PROD);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(37);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'index.android.bundle',
      func: 'value',
      args: [],
      line: 12,
      column: 1917,
    });
    expect(stackFrames.stack[35]).to.deep.equal({
      url: 'index.android.bundle',
      func: 'value',
      args: [],
      line: 29,
      column: 927,
    });
    expect(stackFrames.stack[36]).to.deep.equal({
      url: '[native code]',
      func: '?',
      args: [],
      line: null,
      column: null,
    });
  });

  it('should parse React Native errors on Android Hermes', () => {
    const stackFrames = computeStackTrace(ANDROID_REACT_NATIVE_HERMES);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(26);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'index.android.bundle',
      func: 'onPress',
      args: [],
      line: 1,
      column: 452701,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'native',
      func: '_receiveSignal',
      args: ['native'],
      line: null,
      column: null,
    });
  });
});
