'use strict';

const getChannelURL = require('ember-source-channel-url');
const { embroiderSafe } = require('@embroider/test-setup');

/**
 * Pick which versions of ember against which to test based on whether the tests are running locally, as part of a PR,
 * or when merging to `master` or creating a release.
 *
 * @returns The versions which should be tested, along with their respective config
 */
module.exports = async function() {
  // whenever and wherever we test, we want to at least test against the latest version of ember
  let scenarios = [
    {
      name: 'ember-release',
      npm: {
        devDependencies: {
          'ember-source': await getChannelURL('release'),
        },
      },
    },
  ];

  // in CI we add a few more tests - LTS and embroider (which is an ember compiler)
  if (process.env.GITHUB_ACTIONS) {
    scenarios = scenarios.concat([
      {
        name: 'ember-lts-3.20',
        npm: {
          devDependencies: {
            'ember-source': '~3.24.0',
          },
        },
      },
      embroiderSafe(),
    ]);
  }

  // finally, just to be extra thorough when merging to master and releasing, we add the beta channel and ember
  // "classic" (a legacy version which was last current in late 2019)
  if (
    process.env.GITHUB_EVENT_NAME === 'push' &&
    (process.env.GITHUB_HEAD_REF === 'master' || process.env.GITHUB_HEAD_REF.startsWith('release'))
  ) {
    scenarios = scenarios.concat([
      {
        name: 'ember-beta',
        npm: {
          devDependencies: {
            'ember-source': await getChannelURL('beta'),
          },
        },
        allowedToFail: true,
      },
      {
        name: 'ember-classic',
        env: {
          EMBER_OPTIONAL_FEATURES: JSON.stringify({
            'application-template-wrapper': true,
            'default-async-observers': false,
            'template-only-glimmer-components': false,
          }),
        },
        npm: {
          ember: {
            edition: 'classic',
          },
        },
      },
    ]);
  }

  return {
    useYarn: true,
    scenarios,
  };
};
