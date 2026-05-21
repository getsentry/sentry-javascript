/**
 * Sets a watchdog timer that prints "I'm alive!" and exits if the process
 * doesn't terminate before the timeout. Uses 3000ms to account for the
 * SDK's 2000ms shutdown timeout + buffer.
 */
function expectProcessToExit() {
  setTimeout(() => {
    process.stdout.write("I'm alive!");
    process.exit(0);
  }, 3000);
}

module.exports = { expectProcessToExit };
