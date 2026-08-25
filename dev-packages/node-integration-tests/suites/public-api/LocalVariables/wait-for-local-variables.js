const inspector = require('node:inspector');

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/**
 * LocalVariables captures vars on a worker that attaches after `inspector.open()`.
 * Throwing before that worker has enabled pause-on-exceptions produces events without `vars`.
 */
async function waitForLocalVariablesCapture() {
  const deadline = Date.now() + 8_000;

  while (!inspector.url()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for the Node inspector used by LocalVariables');
    }
    await delay(25);
  }

  // Worker startup + Debugger.setPauseOnExceptions still happens after inspector.open().
  await delay(1_000);
}

module.exports = { waitForLocalVariablesCapture };
