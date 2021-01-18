/* global page, window */
const HOST = `http://localhost:${process.env.PORT}`;

describe('Wasm', () => {
  it('captured exception should include modified frames and debug_meta attribute', async () => {
    await page.goto(HOST);
    const event = await page.evaluate(async () => {
      return window.getEvent();
    });

    expect(event.exception.values[0].stacktrace.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: `${HOST}/simple.wasm`,
          function: 'internal_func',
          in_app: true,
          instruction_addr: '0x8c',
          addr_mode: 'rel:0',
          platform: 'native',
        }),
        expect.objectContaining({
          filename: `${HOST}/`,
          function: 'crash',
          in_app: true,
        }),
      ]),
    );

    expect(event.debug_meta).toMatchObject({
      images: [
        {
          code_file: `${HOST}/simple.wasm`,
          code_id: '0ba020cdd2444f7eafdd25999a8e9010',
          debug_file: null,
          debug_id: '0ba020cdd2444f7eafdd25999a8e90100',
          type: 'wasm',
        },
      ],
    });
  });
});
