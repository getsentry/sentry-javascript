import type { Dialog as TDialog } from './Dialog';

/**
 * Async load the Dialog component for rendering.
 */
export async function loadDialog(): Promise<typeof TDialog> {
  console.log('loading Dialog');
  const { Dialog } = await import('./Dialog');
  console.log('loaded!');
  return Dialog;
}
