const fs = require('fs');
const child_process = require('child_process');
const binaries = require('./binaries.js');

function clean(err) {
  return err.toString().trim();
}

function recompileFromSource() {
  // eslint-disable-next-line no-console
  console.log('@sentry/profiling-node: Compiling from source...');
  let spawn = child_process.spawnSync('npm', ['run', 'build:bindings:configure'], {
    stdio: ['inherit', 'inherit', 'pipe'],
    env: process.env,
    shell: true,
  });

  if (spawn.status !== 0) {
    // eslint-disable-next-line no-console
    console.log('@sentry/profiling-node: Failed to configure gyp');
    // eslint-disable-next-line no-console
    console.log('@sentry/profiling-node:', clean(spawn.stderr));
    return;
  }

  spawn = child_process.spawnSync('npm', ['run', 'build:bindings'], {
    stdio: ['inherit', 'inherit', 'pipe'],
    env: process.env,
    shell: true,
  });
  if (spawn.status !== 0) {
    // eslint-disable-next-line no-console
    console.log('@sentry/profiling-node: Failed to build bindings');
    // eslint-disable-next-line no-console
    console.log('@sentry/profiling-node:', clean(spawn.stderr));
    return;
  }
}

if (fs.existsSync(binaries.target)) {
  try {
    // eslint-disable-next-line no-console
    console.log(`@sentry/profiling-node: Precompiled binary found, attempting to load ${binaries.target}`);
    require(binaries.target);
    // eslint-disable-next-line no-console
    console.log('@sentry/profiling-node: Precompiled binary found, skipping build from source.');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('@sentry/profiling-node: Precompiled binary found but failed loading');
    // eslint-disable-next-line no-console
    console.log('@sentry/profiling-node:', e);
    try {
      recompileFromSource();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('@sentry/profiling-node: Failed to compile from source');
      throw e;
    }
  }
} else {
  // eslint-disable-next-line no-console
  console.log('@sentry/profiling-node: No precompiled binary found');
  recompileFromSource();
}
