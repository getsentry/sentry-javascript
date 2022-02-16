/* global page, window */

const HOST = `http://localhost:${process.env.PORT}`;

describe('Wasm', () => {
  // TODO: This is a quick and dirty way to test the minified browser bundle - `min-bundle.html` is an exact replica of
  // `index.html` save the browser bundle `src` value. In the long run, we should rig it so just the bundle can be
  // passed in. (Or, once the new bundling process is nailed down, stop testing against the minified bundle, since
  // that's not really what this test is for.)
  ['index.html', 'min-bundle.html'].forEach(pagePath =>
    it(`captured exception should include modified frames and debug_meta attribute - ${pagePath}`, async () => {
      await page.goto(`${HOST}/${pagePath}`);
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
            filename: `${HOST}/${pagePath}`,
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
    }),
  );
});
