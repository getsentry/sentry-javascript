import { createRequire } from 'module';

const myRequire = createRequire(import.meta.url);
export { myRequire };
