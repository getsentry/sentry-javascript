import type { RefObject } from 'preact';
import { useEffect, useMemo } from 'preact/hooks';

interface Props<Element extends HTMLElement> {
  elementRef: RefObject<Element>;
  onResize: ResizeObserverCallback;
}

export function useResizeObserver<Element extends HTMLElement>({ elementRef, onResize }: Props<Element>): void {
  const resizeObserver = useMemo(() => {
    return new ResizeObserver(onResize);
  }, [onResize]);

  useEffect(() => {
    if (elementRef.current) {
      const elem = elementRef.current;
      resizeObserver.observe(elem);
      return () => {
        resizeObserver.unobserve(elem);
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return () => {};
  }, [resizeObserver, elementRef.current]);
}
