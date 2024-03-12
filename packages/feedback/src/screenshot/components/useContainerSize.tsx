import type { RefObject } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { useResizeObserver } from './useResizeObserver';

interface Box {
  width: number;
  height: number;
}

export function useContainerSize(canvasContainerRef: RefObject<HTMLDivElement>): Box {
  const [containerSize, setContainerSize] = useState<Box>({ width: 0, height: 0 });

  const onResizeContainer = useCallback(() => {
    if (canvasContainerRef.current) {
      setContainerSize({
        width: canvasContainerRef.current.clientWidth,
        height: canvasContainerRef.current.clientHeight,
      });
    }
  }, []);
  useEffect(() => {
    onResizeContainer();
  }, [canvasContainerRef.current]);
  useResizeObserver({
    elementRef: canvasContainerRef,
    onResize: onResizeContainer,
  });

  return containerSize;
}
