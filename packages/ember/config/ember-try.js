'use strict';

const getChannelURL = require('ember-source-channel-url');
const { embroiderOptimized } = require('@embroider/test-setup');

/**
 * Pick which versions of ember against which to test based on whether the tests are running locally, as part of a PR,
 * or when merging to `master` or creating a release.
 *
 * @returns The versions which should be tested, along with their respective config
 */
module.exports = async function () {
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
    {
      name: 'ember-4.0',
      npm: {
        devDependencies: {
          'ember-source': '~4.0.1',
        },
      },
    },
    embroiderOptimized(),
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
  ];

  return {
    useYarn: true,
    scenarios,
  };
};
