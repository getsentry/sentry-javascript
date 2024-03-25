import { h } from 'preact';

export function RectangleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg width="11.5" height="11.5" viewBox="0 0 11.5 11.5" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 2.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M8.5 2.5H2.5L2.5 8.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HandIcon() {
  return (
    <svg width="13.5" height="13.5" viewBox="0 0 13.5 13.5" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 2L6.5 14.5L8.5 8.5L14.5 6.5L2 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
