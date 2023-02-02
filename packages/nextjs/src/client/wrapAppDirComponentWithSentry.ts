/**
 * Currently just a pass-through to provide isomorphism for the client. May be used in the future to add instrumentation
 * for client components.
 */
export function wrapAppDirComponentWithSentry(wrappingTarget: any): any {
  return wrappingTarget;
}
