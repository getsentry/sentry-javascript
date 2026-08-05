'use strict';

/**
 * Recording stub of the `sentry` CLI SDK for the bundler-plugin integration tests.
 *
 * The real CLI talks to Sentry over HTTP. In these tests we only care about *which* commands the
 * bundler plugin issues and with what arguments, so this stub records each call to
 * `sentry-cli-mock.json` (under `SENTRY_TEST_OUT_DIR`) as a flat CLI-style argument array and
 * resolves without doing any network work. This mirrors the previous approach of patching
 * `@sentry/cli`'s `execute()` to dump its args.
 */

const fs = require('fs');
const path = require('path');

function record(args) {
  const outDir = process.env['SENTRY_TEST_OUT_DIR'];
  if (!outDir) {
    return;
  }
  const out = path.join(outDir, 'sentry-cli-mock.json');
  fs.appendFileSync(out, `${JSON.stringify(args)},\n`);
}

/** Append boolean flags (only when true) and value flags (only when set) to an args array. */
function pushFlags(args, flags, spec) {
  for (const [key, flag] of Object.entries(spec)) {
    const value = flags?.[key];
    if (value === undefined || value === false) {
      continue;
    }
    if (value === true) {
      args.push(flag);
    } else {
      args.push(flag, String(value));
    }
  }
}

function createSentrySDK(options = {}) {
  const project = options.project;

  return {
    release: {
      create(params = {}) {
        const args = ['release', 'create'];
        if (params.orgVersion) {
          args.push(params.orgVersion);
        }
        pushFlags(args, params, { project: '--project', finalize: '--finalize', ref: '--ref', url: '--url' });
        record(args);
        return Promise.resolve(undefined);
      },
      finalize(params = {}) {
        const args = ['release', 'finalize'];
        if (params.orgVersion) {
          args.push(params.orgVersion);
        }
        record(args);
        return Promise.resolve(undefined);
      },
      'set-commits'(params = {}) {
        const args = ['release', 'set-commits'];
        if (params.orgVersion) {
          args.push(params.orgVersion);
        }
        pushFlags(args, params, { auto: '--auto', local: '--local', clear: '--clear', commit: '--commit' });
        record(args);
        return Promise.resolve(undefined);
      },
    },
    sourcemap: {
      upload(params = {}) {
        const args = ['sourcemap', 'upload'];
        if (project) {
          args.push('-p', project);
        }
        pushFlags(args, params, { release: '--release', dist: '--dist' });
        if (params.directory) {
          args.push(params.directory);
        }
        pushFlags(args, params, {
          ext: '--ext',
          ignore: '--ignore',
          urlPrefix: '--url-prefix',
        });
        record(args);
        return Promise.resolve(undefined);
      },
      inject(params = {}) {
        const args = ['sourcemap', 'inject'];
        if (params.directory) {
          args.push(params.directory);
        }
        pushFlags(args, params, { ignore: '--ignore' });
        record(args);
        return Promise.resolve(undefined);
      },
    },
    run(...args) {
      record(args);
      return Promise.resolve(undefined);
    },
  };
}

module.exports = createSentrySDK;
module.exports.default = createSentrySDK;
module.exports.createSentrySDK = createSentrySDK;
