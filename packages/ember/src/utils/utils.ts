import { _backburner, run } from '@ember/runloop';

interface ExtendedBackburner {
  on(eventName: string, callback: (...args: unknown[]) => void): void;
  off(eventName: string, callback: (...args: unknown[]) => void): void;
}

export function getBackburner(): Pick<ExtendedBackburner, 'on' | 'off'> {
  if (_backburner) {
    return _backburner as unknown as Pick<ExtendedBackburner, 'on' | 'off'>;
  }

  if ((run as unknown as { backburner?: Pick<ExtendedBackburner, 'on' | 'off'> }).backburner) {
    return (run as unknown as { backburner: Pick<ExtendedBackburner, 'on' | 'off'> }).backburner;
  }

  return {
    on() {
      // noop
    },
    off() {
      // noop
    },
  };
}
