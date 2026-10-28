export const isViteServer = !!process.env.E2E_TEST_VITE_SERVER;

export const NITRO_ONLY = 'Nitro only: the Vite server builds no `server/` directory';

export const NO_IMPORT_CONFIG = 'Nitro only: the Vite server never had an `--import` config to keep working';

export const NO_META_TAGS = 'Vite server: the SDK adds no trace meta tags yet';
