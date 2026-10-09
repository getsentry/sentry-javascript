import { simulateCLS } from '../../../../utils/web-vitals/cls.ts';

// Getting expected CLS parameter from URL hash
const expectedCLS = Number(location.hash.slice(1));

// CLS lands on the pageload span when it ends on the idle timeout, so nothing has to force the
// page away to finalize it. Reloading here used to do that, but it raced the envelope: on a fast
// browser the reload cancelled the in-flight send before it left the page.
simulateCLS(expectedCLS);
