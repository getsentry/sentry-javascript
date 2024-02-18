import type { DialogComponent } from '../types';
import type { Props as BaseProps } from './DialogBase';

type Return = (props: Omit<BaseProps, 'renderDialog'>) => DialogComponent;

/**
 * Async load the Dialog component for rendering.
 */
export async function loadDialog({ screenshots }: { screenshots: boolean }): Promise<Return> {
  if (screenshots) {
    const { Dialog } = await import('./DialogWithScreenShots');
    return Dialog;
  } else {
    const { Dialog } = await import('./Dialog');
    return Dialog;
  }
}
