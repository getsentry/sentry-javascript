window._testLazyLoadIntegration = async function run() {
  const integration = await window._testSentry.lazyLoadIntegration('httpClientIntegration');

  window._testSentry.getClient()?.addIntegration(integration());

  window._integrationLoaded = true;
};
