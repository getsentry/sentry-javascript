export * from '@sentry/node';

// We're importing this hook to explicitly tell tools like Vercel's `nft` not to throw the file away because it seems unused, because it is actually used by ESM loader hooks the user defines via node CLI arguments.
import 'import-in-the-middle/hook.mjs';
import 'import-in-the-middle';
