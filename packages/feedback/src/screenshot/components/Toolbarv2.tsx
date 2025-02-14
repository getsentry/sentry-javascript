import type { VNode, h as hType } from 'preact';
import type * as Hooks from 'preact/hooks';

interface FactoryParams {
  h: typeof hType;
}

export default function ToolbarFactoryv2({
  h, // eslint-disable-line @typescript-eslint/no-unused-vars
}: FactoryParams) {
  return function Toolbarv2({
    action,
    setAction,
  }: {
    action: 'highlight' | 'hide' | '';
    setAction: Hooks.StateUpdater<'highlight' | 'hide' | ''>;
  }): VNode {
    return (
      <div class="editor__tool-container">
        <div />
        <div class="editor__tool-bar">
          <button
            type="button"
            class={`editor__tool ${action === 'highlight' ? 'editor__tool--active' : ''}`}
            onClick={() => {
              if (action === 'highlight') {
                setAction('');
              } else {
                setAction('highlight');
              }
            }}
          >
            Highlight
          </button>
          <button
            type="button"
            class={`editor__tool ${action === 'hide' ? 'editor__tool--active' : ''}`}
            onClick={() => {
              if (action === 'hide') {
                setAction('');
              } else {
                setAction('hide');
              }
            }}
          >
            Hide
          </button>
        </div>
        <div />
      </div>
    );
  };
}
