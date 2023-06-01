import type { Event } from '@sentry/types';
import { makeProfilingCache } from '@sentry/utils';

export const PROFILING_EVENT_CACHE = makeProfilingCache<string, Event>(20);
