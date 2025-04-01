import type * as Hooks from 'preact/hooks';
import { WINDOW } from '../../constants';

interface FactoryParams {
  hooks: typeof Hooks;
}

type UseDpi = () => number;

export function useDpiFactory({ hooks }: FactoryParams): UseDpi {
  return function useDpi() {
    const [dpi, setDpi] = hooks.useState<number>(WINDOW.devicePixelRatio ?? 1);
    hooks.useEffect(() => {
      const onChange = (): void => {
        setDpi(WINDOW.devicePixelRatio);
      };
      const media = matchMedia(`(resolution: ${WINDOW.devicePixelRatio}dppx)`);
      media.addEventListener('change', onChange);
      return () => {
        media.removeEventListener('change', onChange);
      };
    }, []);

    return dpi;
  };

}
