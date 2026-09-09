import * as Sentry from '@sentry/node';
import { defineHook } from 'eve/hooks';

// Tags every turn of an eve session with the session id as the Sentry conversation id, so a
// session's AI spans — which land in separate traces (each turn is its own durable workflow) —
// group into one conversation in Sentry.
export default defineHook(Sentry.eveConversationHook());
