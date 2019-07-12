// tslint:disable:prefer-template
// tslint:disable:object-literal-sort-keys
// tslint:disable:max-file-line-count

import { expect } from 'chai';

import { _computeStackTrace } from '../../../src/tracekit';

import {
  ANDROID_REACT_NATIVE,
  ANDROID_REACT_NATIVE_PROD,
  CHROME_15,
  CHROME_36,
  CHROME_48_BLOB,
  CHROME_48_EVAL,
  CHROME_XX_WEBPACK,
  FIREFOX_14,
  FIREFOX_3,
  FIREFOX_31,
  FIREFOX_43_EVAL,
  FIREFOX_44_NS_EXCEPTION,
  FIREFOX_50_RESOURCE_URL,
  FIREFOX_7,
  IE_10,
  IE_11,
  IE_11_EVAL,
  IE_9,
  OPERA_10,
  OPERA_11,
  OPERA_12,
  OPERA_25,
  OPERA_854,
  OPERA_902,
  OPERA_927,
  OPERA_964,
  PHANTOMJS_1_19,
  SAFARI_6,
  SAFARI_7,
  SAFARI_8,
  SAFARI_8_EVAL,
} from './originalfixtures';

describe('Tracekit - Original Tests', () => {
  it('should parse Safari 6 error', () => {
    const stackFrames = _computeStackTrace(SAFARI_6);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(4);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 48,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'dumpException3',
      args: [],
      line: 52,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'onclick',
      args: [],
      line: 82,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: '[native code]',
      func: '?',
      args: [],
      line: null,
      column: null,
      context: null,
    });
  });

  it('should parse Safari 7 error', () => {
    const stackFrames = _computeStackTrace(SAFARI_7);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 48,
      column: 22,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 52,
      column: 15,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 108,
      column: 107,
      context: null,
    });
  });

  it('should parse Safari 8 error', () => {
    const stackFrames = _computeStackTrace(SAFARI_8);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 47,
      column: 22,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 52,
      column: 15,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 108,
      column: 23,
      context: null,
    });
  });

  it('should parse Safari 8 eval error', () => {
    // TODO: Take into account the line and column properties on the error object and use them for the first stack trace.
    const stackFrames = _computeStackTrace(SAFARI_8_EVAL);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: '[native code]',
      func: 'eval',
      args: [],
      line: null,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 58,
      column: 21,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 109,
      column: 91,
      context: null,
    });
  });

  it('should parse Firefox 3 error', () => {
    const stackFrames = _computeStackTrace(FIREFOX_3);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(7);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://127.0.0.1:8000/js/stacktrace.js',
      func: '?',
      args: [],
      line: 44,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://127.0.0.1:8000/js/stacktrace.js',
      func: '?',
      args: ['null'],
      line: 31,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://127.0.0.1:8000/js/stacktrace.js',
      func: 'printStackTrace',
      args: [],
      line: 18,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'http://127.0.0.1:8000/js/file.js',
      func: 'bar',
      args: ['1'],
      line: 13,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'http://127.0.0.1:8000/js/file.js',
      func: 'bar',
      args: ['2'],
      line: 16,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[5]).to.deep.equal({
      url: 'http://127.0.0.1:8000/js/file.js',
      func: 'foo',
      args: [],
      line: 20,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[6]).to.deep.equal({
      url: 'http://127.0.0.1:8000/js/file.js',
      func: '?',
      args: [],
      line: 24,
      column: null,
      context: null,
    });
  });

  it('should parse Firefox 7 error', () => {
    const stackFrames = _computeStackTrace(FIREFOX_7);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(7);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'file:///G:/js/stacktrace.js',
      func: '?',
      args: [],
      line: 44,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'file:///G:/js/stacktrace.js',
      func: '?',
      args: ['null'],
      line: 31,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'file:///G:/js/stacktrace.js',
      func: 'printStackTrace',
      args: [],
      line: 18,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'file:///G:/js/file.js',
      func: 'bar',
      args: ['1'],
      line: 13,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'file:///G:/js/file.js',
      func: 'bar',
      args: ['2'],
      line: 16,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[5]).to.deep.equal({
      url: 'file:///G:/js/file.js',
      func: 'foo',
      args: [],
      line: 20,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[6]).to.deep.equal({
      url: 'file:///G:/js/file.js',
      func: '?',
      args: [],
      line: 24,
      column: null,
      context: null,
    });
  });

  it('should parse Firefox 14 error', () => {
    const stackFrames = _computeStackTrace(FIREFOX_14);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 48,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'dumpException3',
      args: [],
      line: 52,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'onclick',
      args: [],
      line: 1,
      column: null,
      context: null,
    });
  });

  it('should parse Firefox 31 error', () => {
    const stackFrames = _computeStackTrace(FIREFOX_31);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 41,
      column: 13,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 1,
      column: 1,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '.plugin/e.fn[c]/<',
      args: [],
      line: 1,
      column: 1,
      context: null,
    });
  });

  it('should parse Firefox 44 ns exceptions', () => {
    const stackFrames = _computeStackTrace(FIREFOX_44_NS_EXCEPTION);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(4);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '[2]</Bar.prototype._baz/</<',
      args: [],
      line: 703,
      column: 28,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'file:///path/to/file.js',
      func: 'App.prototype.foo',
      args: [],
      line: 15,
      column: 2,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'file:///path/to/file.js',
      func: 'bar',
      args: [],
      line: 20,
      column: 3,
      context: null,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'file:///path/to/index.html',
      func: '?',
      args: [],
      line: 23,
      column: 1,
      context: null,
    });
  });

  it('should parse Chrome error with no location', () => {
    const stackFrames = _computeStackTrace({ message: 'foo', name: 'bar', stack: 'error\n at Array.forEach (native)' });
    expect(stackFrames.stack.length).to.be.equal(1);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'native',
      func: 'Array.forEach',
      args: ['native'],
      line: null,
      column: null,
      context: null,
    });
  });

  it('should parse Chrome 15 error', () => {
    const stackFrames = _computeStackTrace(CHROME_15);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(4);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 13,
      column: 17,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 16,
      column: 5,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 20,
      column: 5,
      context: null,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 24,
      column: 4,
      context: null,
    });
  });

  it('should parse Chrome 36 error with port numbers', () => {
    const stackFrames = _computeStackTrace(CHROME_36);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'dumpExceptionError',
      args: [],
      line: 41,
      column: 27,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'HTMLButtonElement.onclick',
      args: [],
      line: 107,
      column: 146,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'I.e.fn.(anonymous function) [as index]',
      args: [],
      line: 10,
      column: 3651,
      context: null,
    });
  });

  it('should parse Chrome error with webpack URLs', () => {
    const stackFrames = _computeStackTrace(CHROME_XX_WEBPACK);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(4);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'webpack:///./src/components/test/test.jsx?',
      func: 'TESTTESTTEST.eval',
      args: [],
      line: 295,
      column: 108,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'webpack:///./src/components/test/test.jsx?',
      func: 'TESTTESTTEST.render',
      args: [],
      line: 272,
      column: 32,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'webpack:///./~/react-transform-catch-errors/lib/index.js?',
      func: 'TESTTESTTEST.tryRender',
      args: [],
      line: 34,
      column: 31,
      context: null,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'webpack:///./~/react-proxy/modules/createPrototypeProxy.js?',
      func: 'TESTTESTTEST.proxiedMethod',
      args: [],
      line: 44,
      column: 30,
      context: null,
    });
  });

  it('should parse nested eval() from Chrome', () => {
    const stackFrames = _computeStackTrace(CHROME_48_EVAL);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(5);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'baz',
      args: [],
      line: 21,
      column: 17,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'foo',
      args: [],
      line: 21,
      column: 17,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'eval',
      args: [],
      line: 21,
      column: 17,
      context: null,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'Object.speak',
      args: [],
      line: 21,
      column: 17,
      context: null,
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: '?',
      args: [],
      line: 31,
      column: 13,
      context: null,
    });
  });

  it('should parse Chrome error with blob URLs', () => {
    const stackFrames = _computeStackTrace(CHROME_48_BLOB);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(7);
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
      func: 's',
      args: [],
      line: 31,
      column: 29146,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
      func: 'Object.d [as add]',
      args: [],
      line: 31,
      column: 30039,
      context: null,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'blob:http%3A//localhost%3A8080/d4eefe0f-361a-4682-b217-76587d9f712a',
      func: '?',
      args: [],
      line: 15,
      column: 10978,
      context: null,
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
      func: '?',
      args: [],
      line: 1,
      column: 6911,
      context: null,
    });
    expect(stackFrames.stack[5]).to.deep.equal({
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
      func: 'n.fire',
      args: [],
      line: 7,
      column: 3019,
      context: null,
    });
    expect(stackFrames.stack[6]).to.deep.equal({
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
      func: 'n.handle',
      args: [],
      line: 7,
      column: 2863,
      context: null,
    });
  });

  it('should parse empty IE 9 error', () => {
    const stackFrames = _computeStackTrace(IE_9);
    expect(stackFrames).to.be.ok;
    stackFrames.stack && expect(stackFrames.stack.length).to.equal(0);
  });

  it('should parse IE 10 error', () => {
    const stackFrames = _computeStackTrace(IE_10);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    // TODO: func should be normalized
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'Anonymous function',
      args: [],
      line: 48,
      column: 13,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 46,
      column: 9,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 82,
      column: 1,
      context: null,
    });
  });

  it('should parse IE 11 error', () => {
    const stackFrames = _computeStackTrace(IE_11);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    // TODO: func should be normalized
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'Anonymous function',
      args: [],
      line: 47,
      column: 21,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 45,
      column: 13,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 108,
      column: 1,
      context: null,
    });
  });

  it('should parse IE 11 eval error', () => {
    const stackFrames = _computeStackTrace(IE_11_EVAL);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'eval code',
      func: 'eval code',
      args: [],
      line: 1,
      column: 1,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 58,
      column: 17,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 109,
      column: 1,
      context: null,
    });
  });

  it('should parse Opera 8.54 error', () => {
    const stackFrames = _computeStackTrace(OPERA_854);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(7);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 44,
      column: null,
      context: ['    this.undef();'],
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 31,
      column: null,
      context: ['    ex = ex || this.createException();'],
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 18,
      column: null,
      context: ['    var p = new printStackTrace.implementation(), result = p.run(ex);'],
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 4,
      column: null,
      context: ['    printTrace(printStackTrace());'],
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 7,
      column: null,
      context: ['    bar(n - 1);'],
    });
    expect(stackFrames.stack[5]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 11,
      column: null,
      context: ['    bar(2);'],
    });
    expect(stackFrames.stack[6]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 15,
      column: null,
      context: ['    foo();'],
    });
  });

  it('should parse Opera 9.02 error', () => {
    const stackFrames = _computeStackTrace(OPERA_902);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(7);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 44,
      column: null,
      context: ['    this.undef();'],
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 31,
      column: null,
      context: ['    ex = ex || this.createException();'],
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 18,
      column: null,
      context: ['    var p = new printStackTrace.implementation(), result = p.run(ex);'],
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 4,
      column: null,
      context: ['    printTrace(printStackTrace());'],
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 7,
      column: null,
      context: ['    bar(n - 1);'],
    });
    expect(stackFrames.stack[5]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 11,
      column: null,
      context: ['    bar(2);'],
    });
    expect(stackFrames.stack[6]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 15,
      column: null,
      context: ['    foo();'],
    });
  });

  it('should parse Opera 9.27 error', () => {
    const stackFrames = _computeStackTrace(OPERA_927);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 43,
      column: null,
      context: ['    bar(n - 1);'],
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 31,
      column: null,
      context: ['    bar(2);'],
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 18,
      column: null,
      context: ['    foo();'],
    });
  });

  it('should parse Opera 9.64 error', () => {
    const stackFrames = _computeStackTrace(OPERA_964);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(6);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 27,
      column: null,
      context: ['            ex = ex || this.createException();'],
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'printStackTrace',
      args: [],
      line: 18,
      column: null,
      context: ['        var p = new printStackTrace.implementation(), result = p.run(ex);'],
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 4,
      column: null,
      context: ['             printTrace(printStackTrace());'],
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 7,
      column: null,
      context: ['           bar(n - 1);'],
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 11,
      column: null,
      context: ['           bar(2);'],
    });
    expect(stackFrames.stack[5]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 15,
      column: null,
      context: ['         foo();'],
    });
  });

  it('should parse Opera 10 error', () => {
    const stackFrames = _computeStackTrace(OPERA_10);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(7);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 42,
      column: null,
      context: ['                this.undef();'],
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 27,
      column: null,
      context: ['            ex = ex || this.createException();'],
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'printStackTrace',
      args: [],
      line: 18,
      column: null,
      context: ['        var p = new printStackTrace.implementation(), result = p.run(ex);'],
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 4,
      column: null,
      context: ['             printTrace(printStackTrace());'],
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 7,
      column: null,
      context: ['           bar(n - 1);'],
    });
    expect(stackFrames.stack[5]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 11,
      column: null,
      context: ['           bar(2);'],
    });
    expect(stackFrames.stack[6]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 15,
      column: null,
      context: ['         foo();'],
    });
  });

  it('should parse Opera 11 error', () => {
    const stackFrames = _computeStackTrace(OPERA_11);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(7);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'createException',
      args: [],
      line: 42,
      column: 12,
      context: ['    this.undef();'],
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'run',
      args: ['ex'],
      line: 27,
      column: 8,
      context: ['    ex = ex || this.createException();'],
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'printStackTrace',
      args: ['options'],
      line: 18,
      column: 4,
      context: ['    var p = new printStackTrace.implementation(), result = p.run(ex);'],
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: ['n'],
      line: 4,
      column: 5,
      context: ['    printTrace(printStackTrace());'],
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: ['n'],
      line: 7,
      column: 4,
      context: ['    bar(n - 1);'],
    });
    expect(stackFrames.stack[5]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 11,
      column: 4,
      context: ['    bar(2);'],
    });
    expect(stackFrames.stack[6]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 15,
      column: 3,
      context: ['    foo();'],
    });
  });

  it('should parse Opera 12 error', () => {
    // TODO: Improve anonymous function name.
    const stackFrames = _computeStackTrace(OPERA_12);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://localhost:8000/ExceptionLab.html',
      func: '<anonymous function>',
      args: ['x'],
      line: 48,
      column: 12,
      context: ['    x.undef();'],
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://localhost:8000/ExceptionLab.html',
      func: 'dumpException3',
      args: [],
      line: 46,
      column: 8,
      context: ['    dumpException((function(x) {'],
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://localhost:8000/ExceptionLab.html',
      func: '<anonymous function>',
      args: ['event'],
      line: 1,
      column: 0,
      context: ['    dumpException3();'],
    });
  });

  it('should parse Opera 25 error', () => {
    const stackFrames = _computeStackTrace(OPERA_25);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 47,
      column: 22,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 52,
      column: 15,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 108,
      column: 168,
      context: null,
    });
  });

  it('should parse PhantomJS 1.19 error', () => {
    const stackFrames = _computeStackTrace(PHANTOMJS_1_19);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'file:///path/to/file.js',
      func: '?',
      args: [],
      line: 878,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 4283,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 4287,
      column: null,
      context: null,
    });
  });

  it('should parse Firefox errors with resource: URLs', () => {
    const stackFrames = _computeStackTrace(FIREFOX_50_RESOURCE_URL);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(3);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'resource://path/data/content/bundle.js',
      func: 'render',
      args: [],
      line: 5529,
      column: 16,
      context: null,
    });
  });

  it('should parse Firefox errors with eval URLs', () => {
    const stackFrames = _computeStackTrace(FIREFOX_43_EVAL);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(5);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'baz',
      args: [],
      line: 26,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[1]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'foo',
      args: [],
      line: 26,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[2]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'eval',
      args: [],
      line: 26,
      column: null,
      context: null,
    });
    expect(stackFrames.stack[3]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: 'speak',
      args: [],
      line: 26,
      column: 17,
      context: null,
    });
    expect(stackFrames.stack[4]).to.deep.equal({
      url: 'http://localhost:8080/file.js',
      func: '?',
      args: [],
      line: 33,
      column: 9,
      context: null,
    });
  });

  it('should parse React Native errors on Android', () => {
    const stackFrames = _computeStackTrace(ANDROID_REACT_NATIVE);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(8);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: '/home/username/sample-workspace/sampleapp.collect.react/src/components/GpsMonitorScene.js',
      func: 'render',
      args: [],
      line: 78,
      column: 24,
      context: null,
    });
    expect(stackFrames.stack[7]).to.deep.equal({
      url:
        '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/native/ReactNativeBaseComponent.js',
      func: 'this',
      args: [],
      line: 74,
      column: 41,
      context: null,
    });
  });

  it('should parse React Native errors on Android Production', () => {
    const stackFrames = _computeStackTrace(ANDROID_REACT_NATIVE_PROD);
    expect(stackFrames).to.be.ok;
    expect(stackFrames.stack.length).to.equal(37);
    expect(stackFrames.stack[0]).to.deep.equal({
      url: 'index.android.bundle',
      func: 'value',
      args: [],
      line: 12,
      column: 1917,
      context: null,
    });
    expect(stackFrames.stack[35]).to.deep.equal({
      url: 'index.android.bundle',
      func: 'value',
      args: [],
      line: 29,
      column: 927,
      context: null,
    });
    expect(stackFrames.stack[36]).to.deep.equal({
      url: '[native code]',
      func: '?',
      args: [],
      line: null,
      column: null,
      context: null,
    });
  });
});
