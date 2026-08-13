import { createCodeTransformer } from '@apm-js-collab/code-transformer-bundler-plugins/core';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHANNELS } from '../../src/orchestrion/channels';
import { SENTRY_INSTRUMENTATIONS } from '../../src/orchestrion/config';
import { orchestrionTransformOptions } from '../../src/orchestrion/bundler/options';

// The code transformer reads the instrumented package's version from its on-disk
// `package.json`, so each case needs a real directory at a real version.
function writePackage(
  root: string,
  name: string,
  version: string,
  filePath: string,
  source: string,
  type?: 'module' | 'commonjs',
): string {
  const dir = join(root, 'node_modules', name);
  const file = join(dir, filePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version, ...(type ? { type } : {}) }));
  writeFileSync(file, source);
  return file;
}

// Minimal stand-ins for the real shapes, verified against the published
// packages: the function each registration-only config targets, and the function
// the span configs target at the older versions.
const SOURCES = {
  ai: 'export async function embedMany({ model }) { return model; }\nexport async function generateText({ model }) { return model; }\n',
  redisClient:
    "'use strict';\nclass RedisClient { async connect() {} async sendCommand(a) { return a; } }\nmodule.exports = { RedisClient };\n",
  ioredis:
    "'use strict';\nclass Redis { connect(cb) { return cb; } sendCommand(c) { return c; } }\nmodule.exports = { Redis };\n",
  mysql2:
    "'use strict';\nclass BaseConnection { pause() {} query(sql, cb) { return cb; } execute(sql, cb) { return cb; } }\nmodule.exports = { BaseConnection };\n",
  mongoose:
    "'use strict';\nconst Query = function(){};\nQuery.prototype.estimatedDocumentCount = function(options) { return options; };\nQuery.prototype.exec = function exec(op) { return op; };\nmodule.exports = Query;\n",
};

interface Case {
  label: string;
  name: string;
  /** A version inside the native-channel range, where only registration should happen. */
  nativeVersion: string;
  /** A version inside the span-producing range, where real channels should be injected. */
  spanVersion: string;
  filePath: string;
  spanFilePath?: string;
  source: string;
  type?: 'module' | 'commonjs';
  expectedRegistration: string;
}

const CASES: Case[] = [
  {
    label: 'ai',
    name: 'ai',
    nativeVersion: '7.0.64',
    spanVersion: '6.0.218',
    filePath: 'dist/index.js',
    source: SOURCES.ai,
    type: 'module',
    expectedRegistration: 'orchestrionModuleInjected("ai", vercelAiIntegration)',
  },
  {
    label: '@redis/client',
    name: '@redis/client',
    nativeVersion: '5.12.1',
    spanVersion: '5.11.0',
    filePath: 'dist/lib/client/index.js',
    source: SOURCES.redisClient,
    expectedRegistration: 'orchestrionModuleInjected("@redis/client", redisChannelIntegration, redisIntegration)',
  },
  {
    label: 'ioredis',
    name: 'ioredis',
    nativeVersion: '5.11.1',
    spanVersion: '5.10.1',
    filePath: 'built/Redis.js',
    source: SOURCES.ioredis,
    expectedRegistration: 'orchestrionModuleInjected("ioredis", ioredisChannelIntegration, redisIntegration)',
  },
  {
    label: 'mysql2',
    name: 'mysql2',
    nativeVersion: '3.23.3',
    spanVersion: '3.19.1',
    filePath: 'lib/base/connection.js',
    source: SOURCES.mysql2,
    expectedRegistration: 'orchestrionModuleInjected("mysql2", mysql2Integration)',
  },
  {
    label: 'mongoose',
    name: 'mongoose',
    nativeVersion: '9.9.2',
    spanVersion: '8.21.0',
    filePath: 'lib/query.js',
    source: SOURCES.mongoose,
    expectedRegistration: 'orchestrionModuleInjected("mongoose", mongooseIntegration)',
  },
];

function transform(root: string, c: Case, version: string): { code: string } | null {
  const file = writePackage(join(root, version), c.name, version, c.filePath, c.source, c.type);
  return createCodeTransformer(orchestrionTransformOptions({})).transform(c.source, file);
}

describe('registration-only instrumentation configs', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'orch-registration-only-'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // The gap this closes: on these versions the library publishes its own tracing
  // channels, so the span configs deliberately don't match and nothing used to be
  // transformed — leaving the subscriber for those native channels uninstalled on
  // SDKs that derive their integrations from the transform (`@sentry/cloudflare`).
  describe.each(CASES)('$label at its native-channel version', c => {
    it('registers the subscriber without injecting any span channel', () => {
      const result = transform(root, c, c.nativeVersion);

      expect(result).not.toBeNull();
      expect(result!.code).toContain(c.expectedRegistration);

      // The only channel declared is the one nothing subscribes to. Injecting a
      // real one here would double-record every operation alongside the native
      // channel, which is exactly what the version bounds exist to prevent.
      const channels = [...result!.code.matchAll(/tracingChannel\("orchestrion:([^"]+)"\)/g)].map(m => m[1]);
      expect(channels).toEqual([`${c.name}:moduleLoaded`]);
    });
  });

  describe.each(CASES)('$label at its span-producing version', c => {
    it('injects real channels and registers exactly once', () => {
      const result = transform(root, c, c.spanVersion);

      expect(result).not.toBeNull();
      expect(result!.code).toContain(c.expectedRegistration);

      const channels = [...result!.code.matchAll(/tracingChannel\("orchestrion:([^"]+)"\)/g)].map(m => m[1]);
      expect(channels.length).toBeGreaterThan(0);
      // The ranges are disjoint, so the registration-only entry must not also match.
      expect(channels).not.toContain(`${c.name}:moduleLoaded`);

      const registrations = result!.code.match(/orchestrionModuleInjected\(/g) ?? [];
      expect(registrations).toHaveLength(1);
    });
  });
});

describe('moduleLoaded', () => {
  const registrationOnlyConfigs = SENTRY_INSTRUMENTATIONS.filter(c => c.channelName === 'moduleLoaded');

  it('is used by every library that has a native-channel version', () => {
    expect(registrationOnlyConfigs.map(c => c.module.name).sort()).toEqual([
      '@redis/client',
      'ai',
      'ai',
      'ioredis',
      'mongoose',
      'mysql2',
    ]);
  });

  // Reusing a real channel name would reintroduce the double recording the
  // version bounds exist to prevent.
  it('is a channel no subscriber listens to', () => {
    const subscribed = Object.values(CHANNELS) as string[];
    for (const name of new Set(registrationOnlyConfigs.map(c => c.module.name))) {
      expect(subscribed).not.toContain(`orchestrion:${name}:moduleLoaded`);
    }
  });

  // `Sync` is the cheapest wrapper the transform emits, and no span is ever
  // produced from these, so the traced value is discarded either way.
  it('only ever wraps functions as Sync', () => {
    for (const config of registrationOnlyConfigs) {
      expect((config.functionQuery as { kind?: string } | undefined)?.kind).toBe('Sync');
    }
  });

  // These ranges are open-ended on purpose, so a new major keeps registering.
  it('uses open-ended version ranges', () => {
    for (const config of registrationOnlyConfigs) {
      expect(config.module.versionRange).toMatch(/^>=[\d.]+$/);
    }
  });
});
