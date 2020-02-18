// Script which checks all browsers in test/integration/browser.js against supported BrowserStack browsers
// Meant to be run manually, by running `yarn test:integration:checkbrowsers` from the command line

const btoa = require('btoa');
const fetch = require('node-fetch');
const localConfigs = require('../test/integration/browsers.js');

const browserstackUsername = process.env.BROWSERSTACK_USERNAME;
const browserstackAccessKey = process.env.BROWSERSTACK_ACCESS_KEY;

const hasCreds = () => {
  return browserstackUsername !== undefined && browserstackAccessKey !== undefined;
};

const fetchCurrentData = (username, key) => {
  const authKey = btoa(`${username}:${key}`);

  return fetch('https://api.browserstack.com/5/browsers?flat=true', {
    headers: {
      Authorization: `Basic ${authKey}`,
    },
  }).then(response => {
    if (response.status >= 200 && response.status < 300) {
      return response.json();
    } else {
      throw new Error(`Unable to fetch data. Status: ${response.status} ${response.statusText}`);
    }
  });
};

const isMatchingEntry = (key, localConfig, bsConfig) => {
  let localValue = localConfig[key];
  let bsValue = bsConfig[key];

  // all values are either null, undefined, or strings, so checking truthiness should
  // save us from trying to lowercase anything that can't handle it
  if (localValue) {
    localValue = localValue.toLowerCase();
  }
  if (bsValue) {
    bsValue = bsValue.toLowerCase();
  }

  if (localValue === bsValue) {
    return true;
  }
  if (key === 'browser_version' && localValue === 'latest') {
    return true;
  }

  return false;
};

const isMatchingConfig = (localConfig, bsConfig) => {
  const checkKeys = ['os', 'os_version', 'browser', 'device', 'browser_version'];

  // bail on the first non-matching entry
  if (checkKeys.some(key => !isMatchingEntry(key, localConfig, bsConfig))) {
    return false;
  }

  // while we're here, if we've found a match on everything else, make sure
  // real_mobile is up to date. Now the data *really* matches!
  if (localConfig.real_mobile !== bsConfig.real_mobile) {
    localConfig.real_mobile_updated = true; // flag for later
    localConfig.real_mobile = bsConfig.real_mobile;
  }

  return true;
};

const isSupported = (localConfig, supportedConfigs) => {
  return supportedConfigs.some(supportedConfig => isMatchingConfig(localConfig, supportedConfig));
};

const checkLocalConfigsVsBrowserStack = (localConfigs, bsConfigs) => {
  const unsupportedConfigs = [];
  const realMobileUpdates = [];

  // check each local config against the entire collection of BS configs
  for (const configName in localConfigs) {
    const localConfig = localConfigs[configName];

    console.log(`\nChecking ${configName}`);

    if (!isSupported(localConfig, bsConfigs)) {
      console.log('  UNSUPPORTED');
      unsupportedConfigs.push(configName);
    } else if (localConfig.real_mobile_updated) {
      console.log('  Supported (but needs real_mobile update)');
      realMobileUpdates.push(configName);
    } else {
      console.log('  Supported!');
    }
  }

  // report on unsupported configs
  if (unsupportedConfigs.length) {
    console.log('\nFound unsupported browser configurations:');
    for (const configName of unsupportedConfigs) {
      console.log(`\n${configName}: `, localConfigs[configName]);
    }
    console.log(
      '\nPlease visit https://api.browserstack.com/5/browsers or https://api.browserstack.com/5/browsers?flat=true to choose new configurations.',
    );
  } else {
    console.log('\nAll configurations supported!\n');
  }

  // report on real_mobile updates
  if (realMobileUpdates.length) {
    console.log('\nFound supported browser configurations which need real_mobile updated:\n');
    for (const configName of realMobileUpdates) {
      console.log(configName, 'new real_mobile value: ', localConfigs[configName].real_mobile);
    }
  }
};

const findUnsupportedConfigs = localConfigs => {
  if (!hasCreds()) {
    console.warn(
      'Unable to find API credentials in env. Please export them as BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY.',
    );
    return;
  }

  fetchCurrentData(browserstackUsername, browserstackAccessKey)
    .then(data => checkLocalConfigsVsBrowserStack(localConfigs, data))
    .catch(err => console.log(err));
};

findUnsupportedConfigs(localConfigs);
