import type { Event } from '@sentry/types';
import { makeFifoCache } from '@sentry/utils';

export const PROFILING_EVENT_CACHE = makeFifoCache<string, Event>(20);
