import { SentryReplay } from '@';

jest.mock('rrweb');

const rrwebMock = require('rrweb');

describe('config', () => {
  beforeEach(() => {
    rrwebMock.record.mockClear();
  });

  it('has default options', () => {
    new SentryReplay();

    expect(rrwebMock.record).toMatchInlineSnapshot(`
      [MockFunction] {
        "calls": Array [
          Array [
            Object {
              "checkoutEveryNms": 300000,
              "emit": [Function],
              "maskAllInputs": true,
            },
          ],
        ],
        "results": Array [
          Object {
            "type": "return",
            "value": undefined,
          },
        ],
      }
    `);
  });

  it('supports other options', () => {
    new SentryReplay({
      ignoreClass: 'test',
      maskAllInputs: false,
    });

    expect(rrwebMock.record).toMatchInlineSnapshot(`
      [MockFunction] {
        "calls": Array [
          Array [
            Object {
              "checkoutEveryNms": 300000,
              "emit": [Function],
              "ignoreClass": "test",
              "maskAllInputs": false,
            },
          ],
        ],
        "results": Array [
          Object {
            "type": "return",
            "value": undefined,
          },
        ],
      }
    `);
  });
});
