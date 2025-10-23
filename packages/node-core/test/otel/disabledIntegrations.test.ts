import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDisabledIntegrations,
  disableIntegrations,
  enableIntegration,
  isIntegrationDisabled,
} from '../../src/otel/disabledIntegrations';

describe('disabledIntegrations', () => {
  beforeEach(() => {
    clearDisabledIntegrations();
  });

  it('should mark an integration as disabled', () => {
    expect(isIntegrationDisabled('TestIntegration')).toBe(false);
    disableIntegrations('TestIntegration');
    expect(isIntegrationDisabled('TestIntegration')).toBe(true);
  });

  it('should enable a disabled integration', () => {
    disableIntegrations('TestIntegration');
    expect(isIntegrationDisabled('TestIntegration')).toBe(true);
    enableIntegration('TestIntegration');
    expect(isIntegrationDisabled('TestIntegration')).toBe(false);
  });

  it('should handle multiple integrations', () => {
    disableIntegrations('Integration1');
    disableIntegrations('Integration2');

    expect(isIntegrationDisabled('Integration1')).toBe(true);
    expect(isIntegrationDisabled('Integration2')).toBe(true);
    expect(isIntegrationDisabled('Integration3')).toBe(false);
  });

  it('should clear all disabled integrations', () => {
    disableIntegrations('Integration1');
    disableIntegrations('Integration2');

    expect(isIntegrationDisabled('Integration1')).toBe(true);
    expect(isIntegrationDisabled('Integration2')).toBe(true);

    clearDisabledIntegrations();

    expect(isIntegrationDisabled('Integration1')).toBe(false);
    expect(isIntegrationDisabled('Integration2')).toBe(false);
  });

  it('should disable multiple integrations at once using an array', () => {
    expect(isIntegrationDisabled('Integration1')).toBe(false);
    expect(isIntegrationDisabled('Integration2')).toBe(false);
    expect(isIntegrationDisabled('Integration3')).toBe(false);

    disableIntegrations(['Integration1', 'Integration2', 'Integration3']);

    expect(isIntegrationDisabled('Integration1')).toBe(true);
    expect(isIntegrationDisabled('Integration2')).toBe(true);
    expect(isIntegrationDisabled('Integration3')).toBe(true);
  });

  it('should enable multiple integrations at once using an array', () => {
    disableIntegrations(['Integration1', 'Integration2', 'Integration3']);

    expect(isIntegrationDisabled('Integration1')).toBe(true);
    expect(isIntegrationDisabled('Integration2')).toBe(true);
    expect(isIntegrationDisabled('Integration3')).toBe(true);

    enableIntegration(['Integration1', 'Integration2']);

    expect(isIntegrationDisabled('Integration1')).toBe(false);
    expect(isIntegrationDisabled('Integration2')).toBe(false);
    expect(isIntegrationDisabled('Integration3')).toBe(true);
  });
});
