import type { Dialog as TDialog } from './Dialog';

/**
 * Async load the Dialog component for rendering.
 */
export async function loadDialog(): Promise<typeof TDialog> {
  const { Dialog } = await import('./Dialog');
  return Dialog;
}
