/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { h, render } from 'preact';
import { useEffect, useState, useRef } from 'preact/hooks';
import { GLOBAL_OBJ } from '@sentry/utils';

// exporting a separate copy of `WINDOW` rather than exporting the one from `@sentry/browser`
// prevents the browser package from being bundled in the CDN bundle, and avoids a
// circular dependency between the browser and feedback packages
export const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

// const Wrapper = styled.div`
//   position: fixed;
//   width: 100vw;
//   padding-top: 8px;
//   left: 0;
//   pointer-events: none;
//   display: flex;
//   justify-content: center;
//   transition: transform 0.2s ease-in-out;
//   transition-delay: 0.5s;
//   transform: translateY(0);
//   &[data-hide='true'] {
//     transition-delay: 0s;
//     transform: translateY(-100%);
//   }
// `;

// const Content = styled.div`
//   background-color: #231c3d;
//   border: 1px solid #ccc;
//   border-radius: 20px;
//   color: #fff;
//   font-size: 14px;
//   padding: 6px 24px;
//   box-shadow:
//     0 0 0 1px rgba(0, 0, 0, 0.05),
//     0 4px 16px rgba(0, 0, 0, 0.2);
// `;

export function ScreenshotEditorHelp({ hide }: { hide: boolean }) {
  const [isHidden, setIsHidden] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let boundingRect: DOMRect;
    if (contentRef.current) {
      boundingRect = contentRef.current?.getBoundingClientRect();
    }
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const { left, bottom, right } = boundingRect;
      const threshold = 50;
      const isNearContent = clientX > left - threshold && clientX < right + threshold && clientY < bottom + threshold;
      if (isNearContent) {
        setIsHidden(true);
      } else {
        setIsHidden(false);
      }
    };

    function handleResize() {
      if (contentRef.current) {
        boundingRect = contentRef.current?.getBoundingClientRect();
      }
    }

    WINDOW.addEventListener('resize', handleResize);
    WINDOW.addEventListener('mousemove', handleMouseMove);
    return () => {
      WINDOW.removeEventListener('resize', handleResize);
      WINDOW.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div
      style="  position: fixed;
    width: 100vw;
    padding-top: 8px;
    left: 0;
    pointer-events: none;
    display: flex;
    justify-content: center;
    transition: transform 0.2s ease-in-out;
    transition-delay: 0.5s;
    transform: translateY(0);
    &[data-hide='true'] {
      transition-delay: 0s;
      transform: translateY(-100%);
    }"
      data-hide={isHidden || hide}
    >
      <div
        style="  background-color: #231c3d;
        border: 1px solid #ccc;
        border-radius: 20px;
        color: #fff;
        font-size: 14px;
        padding: 6px 24px;
        box-shadow:
          0 0 0 1px rgba(0, 0, 0, 0.05),
          0 4px 16px rgba(0, 0, 0, 0.2);"
        ref={contentRef}
      >
        {'Mark the problem on the screen (press "Enter" to skip)'}
        <button>Cancel</button>
        <button>Confirm</button>
      </div>
    </div>
  );
}
