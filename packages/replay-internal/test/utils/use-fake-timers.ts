import { vi } from 'vitest';

export function useFakeTimers(): void {
  vi.useFakeTimers();
}
