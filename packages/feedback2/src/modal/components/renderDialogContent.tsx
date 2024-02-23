// biome-ignore lint/nursery/noUnusedImports: reason
import { h, render } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars

import { DialogContent } from './DialogContent';
import type { Props as DialogContentProps } from './DialogContent';

export type Props = DialogContentProps;

export function renderDialogContent(parent: HTMLElement, props: DialogContentProps): void {
  render(<DialogContent {...props} />, parent);
}
