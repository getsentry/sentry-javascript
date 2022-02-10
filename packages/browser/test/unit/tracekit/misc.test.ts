import { computeStackTrace } from '../../../src/tracekit';

describe('Tracekit - Misc Tests', () => {
  it('should parse PhantomJS 1.19 error', () => {
    const PHANTOMJS_1_19 = {
      name: 'foo',
      message: 'bar',
      stack:
        'Error: foo\n' +
        '    at file:///path/to/file.js:878\n' +
        '    at foo (http://path/to/file.js:4283)\n' +
        '    at http://path/to/file.js:4287',
    };
    const stackFrames = computeStackTrace(PHANTOMJS_1_19);

    expect(stackFrames).toEqual({
      message: 'bar',
      name: 'foo',
      stack: [
        { url: 'file:///path/to/file.js', func: '?', line: 878, column: null },
        { url: 'http://path/to/file.js', func: 'foo', line: 4283, column: null },
        { url: 'http://path/to/file.js', func: '?', line: 4287, column: null },
      ],
    });
  });
});
