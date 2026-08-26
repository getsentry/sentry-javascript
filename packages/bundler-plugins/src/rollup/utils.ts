import { createRequire } from 'node:module';

export function hasExistingDebugID(code: string): boolean {
  const chunkStartSnippet = code.slice(0, 6000);
  const chunkEndSnippet = code.slice(-500);

  return chunkStartSnippet.includes('_sentryDebugIdIdentifier') || chunkEndSnippet.includes('//# debugId=');
}

export function getRollupMajorVersion(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Rollup already transpiles this for us
    const req = createRequire(import.meta.url);
    const rollup = req('rollup') as { VERSION?: string };
    return rollup.VERSION?.split('.')[0];
  } catch {
    return undefined;
  }
}
