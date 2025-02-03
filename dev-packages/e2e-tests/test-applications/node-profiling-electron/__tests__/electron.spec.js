const process = require('process');
const { test, expect, _electron: electron } = require('@playwright/test');

test('an h1 contains hello world"', async () => {
  const electronApp = await electron.launch({
    args: ['./index.electron.js'],
    process: {
      env: {
        ...process.env,
        NODE_ENV: 'development',
      },
    },
  });

  // Wait for the first BrowserWindow to open
  const window = await electronApp.firstWindow();

  // Check for the presence of an h1 element with the text "hello"
  const headerElement = await window.$('h1');
  const headerText = await headerElement.textContent();
  expect(headerText).toBe('Hello From Profiled Electron App');

  // Close the app
  await electronApp.close();
});
