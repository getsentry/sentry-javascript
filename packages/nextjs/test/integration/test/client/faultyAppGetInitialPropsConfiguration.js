const expect = require('expect');

// This test verifies that a faulty configuration of `getInitialProps` in `_app` will not cause our
// auto - wrapping / instrumentation to throw an error.
// See `_app.tsx` for more information.

module.exports = async ({ page, url }) => {
  await page.goto(`${url}/faultyAppGetInitialProps`);
  const serverErrorText = await page.$x('//*[contains(text(), "Internal Server Error")]');
  expect(serverErrorText).toHaveLength(0);
};
