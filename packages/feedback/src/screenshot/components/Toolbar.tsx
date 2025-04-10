import type { VNode, h as hType } from 'preact';
import type * as Hooks from 'preact/hooks';

interface FactoryParams {
  h: typeof hType;
}

export default function ToolbarFactory({
  h, // eslint-disable-line @typescript-eslint/no-unused-vars
}: FactoryParams) {
  return function Toolbar({
    action,
    setAction,
  }: {
    action: 'highlight' | 'hide' | '';
    setAction: Hooks.StateUpdater<'highlight' | 'hide' | ''>;
  }): VNode {
    return (
      <div class="editor__tool-container">
        <div class="editor__tool-bar">
          <button
            type="button"
            class={`editor__tool ${action === 'highlight' ? 'editor__tool--active' : ''}`}
            onClick={() => {
              setAction(action === 'highlight' ? '' : 'highlight');
            }}
          >
            Highlight
          </button>
          <button
            type="button"
            class={`editor__tool ${action === 'hide' ? 'editor__tool--active' : ''}`}
            onClick={() => {
              setAction(action === 'hide' ? '' : 'hide');
            }}
          >
            Hide
          </button>
        </div>
      </div>
    );
  };
}
