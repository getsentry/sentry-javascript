import type { InstrumentationConfig } from '..';
import { uniq } from '@sentry/core';

export function getModuleNames(config: InstrumentationConfig[]): string[] {
  return uniq(config.map(config => config.module.name));
}
