import SentryRRWeb from "../src/";

jest.mock("rrweb");

const rrwebMock = require("rrweb");

describe("config", () => {
  beforeEach(() => {
    rrwebMock.record.mockClear();
  });

  it("has default options", () => {
    const integration = new SentryRRWeb();

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

  it("supports other options", () => {
    const integration = new SentryRRWeb({
      ignoreClass: "test",
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
