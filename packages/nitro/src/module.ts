import { defineNitroModule } from 'nitropack/kit';
import { addDatabaseInstrumentation } from './rollup/databaseConfig';
import { addMiddlewareInstrumentation } from './rollup/middlewareConfig';
import { addStorageInstrumentation } from './rollup/storageConfig';

export default defineNitroModule({
  name: '@sentry/nitro',
  setup(nitro) {
    addMiddlewareInstrumentation(nitro);
    addStorageInstrumentation(nitro);
    addDatabaseInstrumentation(nitro);
  },
});
