import type { FeedbackInternalOptions } from '@sentry/core';
import type { h as hType, VNode } from 'preact';
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
    options,
  }: {
    action: 'highlight' | 'hide' | '';
    setAction: Hooks.StateUpdater<'highlight' | 'hide' | ''>;
    options: FeedbackInternalOptions;
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
            {options.highlightToolText}
          </button>
          <button
            type="button"
            class={`editor__tool ${action === 'hide' ? 'editor__tool--active' : ''}`}
            onClick={() => {
              setAction(action === 'hide' ? '' : 'hide');
            }}
          >
            {options.hideToolText}
          </button>
        </div>
      </div>
    );
  };
}
