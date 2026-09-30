import { expect, test } from '@playwright/test';

function getScriptNonces(html: string): string[] {
  return Array.from(html.matchAll(/<script[^>]*\snonce="([^"]+)"/g), match => match[1]!);
}

test.describe('CSP nonce', () => {
  test('adds the same per-request nonce to all inline scripts', async ({ request }) => {
    const firstHtml = await (await request.get('/')).text();
    const secondHtml = await (await request.get('/')).text();

    const firstNonces = getScriptNonces(firstHtml);
    const secondNonces = getScriptNonces(secondHtml);

    expect(firstNonces.length).toBeGreaterThan(0);
    expect(firstNonces.length).toBe((firstHtml.match(/<script/g) ?? []).length);
    expect(new Set(firstNonces).size).toBe(1);
    expect(new Set(secondNonces).size).toBe(1);
    expect(firstNonces[0]).not.toBe(secondNonces[0]);

    expect(firstHtml).toContain('<meta name="sentry-trace"');
  });
});
