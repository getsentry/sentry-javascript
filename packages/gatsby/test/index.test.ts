import * as GatsbyIntegration from '../src';

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
