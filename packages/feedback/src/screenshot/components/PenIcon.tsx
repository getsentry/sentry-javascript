import type { VNode, h as hType } from 'preact';

interface FactoryParams {
  h: typeof hType;
}

export default function PenIconFactory({
  h, // eslint-disable-line @typescript-eslint/no-unused-vars
}: FactoryParams) {
  return function PenIcon({ isAnnotating, onClick }: { isAnnotating: boolean; onClick: (e: Event) => void }): VNode {
    return (
      <button
        class="editor__pen-tool"
        style={{
          background: isAnnotating
            ? 'var(--button-primary-background, var(--accent-background))'
            : 'var(--button-background, var(--background))',
          color: isAnnotating
            ? 'var(--button-primary-foreground, var(--accent-foreground))'
            : 'var(--button-foreground, var(--foreground))',
        }}
        onClick={onClick}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M8.5 12L12 8.5L14 11L11 14L8.5 12Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12 8.5L11 3.5L2 2L3.5 11L8.5 12L12 8.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M2 2L7.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  };
}
