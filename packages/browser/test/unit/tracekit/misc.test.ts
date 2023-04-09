import { exceptionFromError } from '../../../src/eventbuilder';
import { defaultStackParser as parser } from '../../../src/stack-parsers';

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
    const ex = exceptionFromError(parser, PHANTOMJS_1_19);

    expect(ex).toEqual({
      value: 'bar',
      type: 'foo',
      stacktrace: {
        frames: [
          { filename: 'http://path/to/file.js', function: '?', lineno: 4287, in_app: true },
          { filename: 'http://path/to/file.js', function: 'foo', lineno: 4283, in_app: true },
          { filename: 'file:///path/to/file.js', function: '?', lineno: 878, in_app: true },
        ],
      },
    });
  });
});
