// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type { ComponentChildren, VNode } from 'preact';

export interface Props {
  children: ComponentChildren;
}

export function DialogContent({ children }: Props): VNode {
  return (
    <div
      class="dialog__content"
      onClick={e => {
        // Stop event propagation so clicks on content modal do not propagate to dialog (which will close dialog)
        e.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}
