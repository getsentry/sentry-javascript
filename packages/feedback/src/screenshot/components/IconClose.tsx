import type { h as hType, VNode } from 'preact';

interface FactoryParams {
  h: typeof hType;
}

export default function IconCloseFactory({
  h, // eslint-disable-line @typescript-eslint/no-unused-vars
}: FactoryParams) {
  return function IconClose(): VNode {
    return (
      <svg data-test-id="icon-close" viewBox="0 0 16 16" fill="#2B2233" height="25px" width="25px">
        <circle r="7" cx="8" cy="8" fill="white" />
        <path
          strokeWidth="1.5"
          d="M8,16a8,8,0,1,1,8-8A8,8,0,0,1,8,16ZM8,1.53A6.47,6.47,0,1,0,14.47,8,6.47,6.47,0,0,0,8,1.53Z"
        ></path>
        <path
          strokeWidth="1.5"
          d="M5.34,11.41a.71.71,0,0,1-.53-.22.74.74,0,0,1,0-1.06l5.32-5.32a.75.75,0,0,1,1.06,1.06L5.87,11.19A.74.74,0,0,1,5.34,11.41Z"
        ></path>
        <path
          strokeWidth="1.5"
          d="M10.66,11.41a.74.74,0,0,1-.53-.22L4.81,5.87A.75.75,0,0,1,5.87,4.81l5.32,5.32a.74.74,0,0,1,0,1.06A.71.71,0,0,1,10.66,11.41Z"
        ></path>
      </svg>
    );
  };
}
