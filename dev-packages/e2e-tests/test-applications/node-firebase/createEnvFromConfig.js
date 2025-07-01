const createEnvFromConfig = require('./docker/firebase/utils').createEnvFromConfig;

(async () => {
  try {
    await createEnvFromConfig();
  } catch (e) {
    console.error(e);
  }
})();

