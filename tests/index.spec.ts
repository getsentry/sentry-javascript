import { SentryReplay } from '@';

jest.mock('rrweb');

const rrwebMock = require('rrweb');

describe('config', () => {
  beforeEach(() => {
    rrwebMock.record.mockClear();
  });

  it('has default options', () => {
    new SentryReplay();

    expect(rrwebMock.record).toMatchInlineSnapshot(`[MockFunction]`);
  });

  it('supports other options', () => {
    new SentryReplay({
      rrwebConfig: {
        ignoreClass: 'test',
        maskAllInputs: false,
      },
    });

    expect(rrwebMock.record).toMatchInlineSnapshot(`[MockFunction]`);
  });
});
