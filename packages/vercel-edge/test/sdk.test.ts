import { describe, expect, it } from 'vitest';
import { getDefaultIntegrations } from '../src';

describe('getDefaultIntegrations', () => {
  it('returns list of integrations with default options', () => {
    const integrations = getDefaultIntegrations({}).map(integration => integration.name);
    expect(integrations).toEqual([
      'Dedupe',
      'InboundFilters',
      'FunctionToString',
      'LinkedErrors',
      'WinterCGFetch',
      'Console',
    ]);
  });

  it('returns spanStreamingIntegration if traceLifecycle is stream', () => {
    const integrations = getDefaultIntegrations({ traceLifecycle: 'stream' }).map(integration => integration.name);
    expect(integrations).toEqual([
      'Dedupe',
      'InboundFilters',
      'FunctionToString',
      'LinkedErrors',
      'WinterCGFetch',
      'Console',
      'SpanStreaming',
    ]);
  });

  it('returns requestDataIntegration if sendDefaultPii is true', () => {
    const integrations = getDefaultIntegrations({ sendDefaultPii: true }).map(integration => integration.name);
    expect(integrations).toEqual([
      'Dedupe',
      'InboundFilters',
      'FunctionToString',
      'LinkedErrors',
      'WinterCGFetch',
      'Console',
      'RequestData',
    ]);
  });
});
