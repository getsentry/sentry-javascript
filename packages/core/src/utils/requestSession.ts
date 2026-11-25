import type { Scope, SdkProcessingMetadata } from '../scope';

type RequestSession = NonNullable<SdkProcessingMetadata['requestSession']>;

export function getRequestSession(isolationScope: Scope): RequestSession | undefined {
  return isolationScope.getScopeData().sdkProcessingMetadata.requestSession;
}

/** Tracks an error of the request that is still in the event pipeline, so the session waits for it. */
export function addPendingRequestSessionError(isolationScope: Scope, processing: PromiseLike<unknown>): void {
  const requestSession = getRequestSession(isolationScope);
  if (!requestSession) {
    return;
  }

  const pendingErrors = (requestSession.pendingErrors ||= new Set());
  const settle = (): void => {
    pendingErrors.delete(processing);
  };
  pendingErrors.add(processing);
  processing.then(settle, settle);
}

/** Marks the request session as errored, or as crashed for an unhandled error. */
export function setRequestSessionErroredOrCrashed(isolationScope: Scope, isUnhandled: boolean): void {
  const requestSession = getRequestSession(isolationScope);
  if (!requestSession) {
    return;
  }

  // We mutate instead of doing `setSdkProcessingMetadata` because the http integration stores away a particular
  // isolationScope. If that isolation scope is forked, setting the processing metadata here will not mutate the
  // original isolation scope that the http integration stored away.
  // A request session can go from "errored" -> "crashed" but not "crashed" -> "errored".
  // Crashed (unhandled exception) is worse than errored (handled exception).
  if (isUnhandled) {
    requestSession.status = 'crashed';
  } else if (requestSession.status !== 'crashed') {
    requestSession.status = 'errored';
  }
}

/** Crashes the request session if an error counted. That error can still be in the event pipeline. */
export function crashRequestSessionIfErrored(isolationScope: Scope): void {
  const requestSession = getRequestSession(isolationScope);
  if (!requestSession) {
    return;
  }

  const crashIfErrored = (): void => {
    if (requestSession.status === 'errored') {
      requestSession.status = 'crashed';
    }
  };
  if (!requestSession.pendingErrors?.size) {
    crashIfErrored();
    return;
  }
  addPendingRequestSessionError(isolationScope, Promise.allSettled(requestSession.pendingErrors).then(crashIfErrored));
}
