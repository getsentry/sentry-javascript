import type { MissingInstrumentationContext } from '@sentry/core';
import { isCjs } from './commonjs';

export const createMissingInstrumentationContext = (pkg: string): MissingInstrumentationContext => ({
  package: pkg,
  'javascript.is_cjs': isCjs(),
});
