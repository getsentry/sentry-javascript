window._testLazyLoadIntegration = async function run() {
  const integration = await window.Sentry.lazyLoadIntegration('feedbackIntegration');

  window.Sentry.getClient()?.addIntegration(integration());

  window._integrationLoaded = true;
};
