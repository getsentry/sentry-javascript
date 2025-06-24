const path = require('path');
const dotent = require('dotenv');
dotent.config({ path: path.resolve(__dirname, './docker/.env') });

const createConfigFromEnv = require('./docker/firebase/utils').createConfigFromEnv;

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
  try {
    await createConfigFromEnv();
  } catch (e) {
    console.error(e);
  }
})();
