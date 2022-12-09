/* eslint-env node */
const cp = require('child_process');
const os = require('os');

const { target } = require('./binaries');

function recompileFromSource() {
  try {
    // eslint-disable-next-line no-console
    console.log('@sentry/profiling-node: Precompiled binary not found, compiling from source...');
    cp.execSync(`npm run build:configure --arch=${os.arch()}`);
    cp.execSync('npm run build:bindings');
    cp.execSync('node scripts/copy-target.js');
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      '@sentry/profiling-node: Failed to build from source, please report this a bug at https://github.com/getsentry/profiling-node/issues/new?assignees=&labels=Type%3A+Bug&template=bug.yml'
    );
    return false;
  }
}

try {
  require(target);
  // eslint-disable-next-line no-console
  console.log('@sentry/profiling-node: Precompiled binary found, skipping build from source.');
} catch (e) {
  // Check for node version missmatch
  if (/was compiled against a different Node.js/.test(e.message)) {
    const success = recompileFromSource();
    if (success) {
      process.exit(0);
    }
  }
  // Not sure if this could even happen, but just in case it somehow does,
  //  we can provide a better experience than just crashing with cannot find module message.
  if (/Cannot find module/.test(e.message)) {
    const success = recompileFromSource();
    if (success) {
      process.exit(0);
    }
  }

  // re-throw so we dont end up swallowing errors
  throw e;
}
