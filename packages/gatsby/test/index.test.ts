import { describe, expect, it } from 'vitest';
import * as GatsbyIntegration from '../src/index';

describe('package', () => {
  it('exports init', () => {
    expect(GatsbyIntegration.init).toBeDefined();
  });

  it('exports ErrorBoundary', () => {
    expect(GatsbyIntegration.ErrorBoundary).toBeDefined();
    expect(GatsbyIntegration.withErrorBoundary).toBeDefined();
  });

  it('exports Profiler', () => {
    expect(GatsbyIntegration.Profiler).toBeDefined();
    expect(GatsbyIntegration.withProfiler).toBeDefined();
    expect(GatsbyIntegration.useProfiler).toBeDefined();
  });
});
