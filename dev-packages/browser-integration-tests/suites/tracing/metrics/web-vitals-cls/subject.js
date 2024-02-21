import { simulateCLS } from '../../../../utils/web-vitals/cls.ts';

// Getting expected CLS parameter from URL hash
const expectedCLS = Number(location.hash.slice(1));

simulateCLS(expectedCLS).then(
  // Triggering reload to make sure getCLS has its closure before we send the transaction
  () => location.reload(),
);
