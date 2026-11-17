import type { Client, Options } from '@sentry/core';
import { applySdkMetadata, SDK_VERSION } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { isTargetPatched } from '../../src/integrations/helpers';
import { nestIntegration } from '../../src/integrations/nest';
import type { InjectableTarget } from '../../src/integrations/types';

function setupWithRuntimeSdk(name: string, names?: string[]): Options {
  const options: Options = {};
  applySdkMetadata(options, name, names);
  nestIntegration().setup!({ getOptions: () => options } as unknown as Client);
  return options;
}

describe('Nest', () => {
  describe('isTargetPatched', () => {
    it('should return true if target is already patched', () => {
      const target = { name: 'TestTarget', sentryPatchedInjectable: true, prototype: {} };
      expect(isTargetPatched(target, 'sentryPatchedInjectable')).toBe(true);
    });

    it('should add the patch flag and return false if target is not patched', () => {
      const target: InjectableTarget = { name: 'TestTarget', prototype: {} };
      expect(isTargetPatched(target, 'sentryPatchedInjectable')).toBe(false);
      expect(target.sentryPatchedInjectable).toBe(true);
    });
  });

  describe('SDK metadata', () => {
    it.each(['bun', 'deno', 'cloudflare', 'node'])('names the SDK `nestjs` when the %s SDK inits', runtime => {
      expect(setupWithRuntimeSdk(runtime)._metadata).toEqual({
        sdk: {
          name: 'sentry.javascript.nestjs',
          packages: [
            { name: 'npm:@sentry/nestjs', version: SDK_VERSION },
            { name: `npm:@sentry/${runtime}`, version: SDK_VERSION },
          ],
          version: SDK_VERSION,
        },
      });
    });

    it('keeps the metadata the NestJS SDK set', () => {
      expect(setupWithRuntimeSdk('nestjs', ['nestjs', 'node'])._metadata).toEqual({
        sdk: {
          name: 'sentry.javascript.nestjs',
          packages: [
            { name: 'npm:@sentry/nestjs', version: SDK_VERSION },
            { name: 'npm:@sentry/node', version: SDK_VERSION },
          ],
          version: SDK_VERSION,
        },
      });
    });
  });
});
