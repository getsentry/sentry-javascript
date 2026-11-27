import 'reflect-metadata';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { SentryModule } from '../src/setup';

describe('SentryModule', () => {
  it('registers the tracing interceptor once when imported with forRoot()', () => {
    const staticProviders: unknown[] = Reflect.getMetadata('providers', SentryModule) ?? [];
    const dynamicProviders: unknown[] = SentryModule.forRoot().providers ?? [];

    const interceptors = [...staticProviders, ...dynamicProviders].filter(
      provider => (provider as { provide?: unknown }).provide === APP_INTERCEPTOR,
    );

    expect(interceptors).toHaveLength(1);
  });
});
