import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('MCP OAuth client attribution', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  for (const version of ['v1', 'v2']) {
    createEsmAndCjsTests(
      __dirname,
      `scenario-${version}.mjs`,
      'instrument.mjs',
      (createTestRunner, test) => {
        test(`keeps ${version} OAuth identity request-local and separate from MCP identity`, async () => {
          await createTestRunner()
            .unordered()
            .expect({
              span: container => {
                const root = container.items.find(item => item.name === 'oauth requests');
                expect(root?.attributes['test.responses.checked']?.value).toBe(true);
                const requests = container.items.filter(
                  item => item.attributes['sentry.op']?.value === 'mcp.server' && item.attributes['mcp.request.id'],
                );
                expect(requests).toHaveLength(4);
                for (const [id, method, oauthName] of [
                  ['discovery', version === 'v1' ? 'initialize' : 'server/discover', 'Registered Discovery'],
                  ['context', 'tools/list', 'Registered Context'],
                  ['unsupported', 'resources/list', 'Registered Unsupported'],
                  ['missing', 'tools/list', undefined],
                ]) {
                  const request = requests.find(item => item.attributes['mcp.request.id']?.value === id);
                  expect(request).toBeDefined();
                  expect(request?.attributes['mcp.method.name']?.value).toBe(method);
                  expect(request?.attributes['mcp.auth.client.name']?.value).toBe(oauthName);
                  expect(request?.attributes['mcp.client.name']?.value).toBe(
                    version === 'v1' ? 'protocol-v1' : id === 'missing' ? undefined : `protocol-${id}`,
                  );
                }
                expect(JSON.stringify(container)).not.toContain('Notification Client');
              },
            })
            .start()
            .completed();
        });
      },
      version === 'v1' ? { additionalDependencies: { '@modelcontextprotocol/sdk': '1.30.0' } } : undefined,
    );
  }
});
