import { useEffect, useRef, useState } from 'preact/hooks';
import { h } from 'preact';

import { ImageEditor } from './imageEditor';
import { Arrow, Pen, Rectangle } from './tool';

interface Params {
  canvas: HTMLCanvasElement | null;
  image: HTMLCanvasElement;
  onLoad?: () => void;
}

export type ToolKey = 'arrow' | 'pen' | 'rectangle' | 'select';
export const Tools: ToolKey[] = ['arrow', 'pen', 'rectangle', 'select'];

export function useImageEditor({ canvas, image, onLoad }: Params) {
  const editorRef = useRef<ImageEditor | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolKey>('arrow');
  const [selectedColor, setSelectedColor] = useState<string>('#ff7738');
  const [strokeSize, setStrokeSize] = useState<number>(6);

  useEffect(() => {
    if (!canvas) {
      return () => {};
    }
    const editor = new ImageEditor({ canvas, image, onLoad });
    editor.tool = new Arrow();
    editor.color = '#ff7738';
    editor.strokeSize = 6;
    editorRef.current = editor;
    return () => {
      editor.destroy();
    };
  }, [canvas, image, onLoad]);

  useEffect(() => {
    if (editorRef.current) {
      switch (selectedTool) {
        case 'arrow':
          editorRef.current.tool = new Arrow();
          break;
        case 'pen':
          editorRef.current.tool = new Pen();
          break;
        case 'rectangle':
          editorRef.current.tool = new Rectangle();
          break;
        default:
          editorRef.current.tool = null;
          break;
      }
    }
  }, [selectedTool]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.color = selectedColor;
    }
  }, [selectedColor]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.strokeSize = strokeSize;
    }
  }, [strokeSize]);

  return {
    selectedTool,
    setSelectedTool,
    selectedColor,
    setSelectedColor,
    strokeSize,
    setStrokeSize,
    getBlob: () => editorRef.current!.getBlob(),
  };
}
