window._testLazyLoadIntegration = async function run() {
  const integration = await window.Sentry.lazyLoadIntegration('moduleMetadataIntegration');

  window.Sentry.getClient()?.addIntegration(integration());

  window._integrationLoaded = true;
};
