import type { VNode, h as hType } from 'preact';

interface FactoryParams {
  h: typeof hType;
}

export default function CropIconFactory({
  h, // eslint-disable-line @typescript-eslint/no-unused-vars
}: FactoryParams) {
  return function CropIcon(): VNode {
    return (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M15.25 12.5H12.5M12.5 12.5H4.50001C3.94773 12.5 3.50001 12.0523 3.50001 11.5V3.50002M12.5 12.5L12.5 4.50002C12.5 3.94773 12.0523 3.50002 11.5 3.50002H3.50001M12.5 12.5L12.5 15.25M3.50001 3.50002V0.750031M3.50001 3.50002H0.75"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };
}
