import type { VNode, h as hType } from 'preact';
import type * as Hooks from 'preact/hooks';
import CropIconFactory from './CropIcon';
import PenIconFactory from './PenIcon';

interface FactoryParams {
  h: typeof hType;
}

export default function ToolbarFactory({ h }: FactoryParams) {
  return function Toolbar({
    action,
    setAction,
  }: {
    action: 'crop' | 'annotate' | '';
    setAction: Hooks.StateUpdater<'crop' | 'annotate' | ''>;
  }): VNode {
    const PenIcon = PenIconFactory({ h });
    const CropIcon = CropIconFactory({ h });

    return (
      <div class="editor__tool-container">
        <div />
        <div class="editor__tool-bar">
          <button
            type="button"
            class={`editor__tool ${action === 'crop' ? 'editor__tool--active' : ''}`}
            onClick={() => {
              if (action === 'crop') {
                setAction('');
              } else {
                setAction('crop');
              }
            }}
          >
            <CropIcon />
          </button>
          <button
            type="button"
            class={`editor__tool ${action === 'annotate' ? 'editor__tool--active' : ''}`}
            onClick={() => {
              if (action === 'annotate') {
                setAction('');
              } else {
                setAction('annotate');
              }
            }}
          >
            <PenIcon />
          </button>
        </div>
        <div />
      </div>
    );
  };
}
