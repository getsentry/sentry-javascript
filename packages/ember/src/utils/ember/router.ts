import type RouterService from '@ember/routing/router-service';
import type Transition from '@ember/routing/transition';

export interface EmberRouterMain {
  location: {
    formatURL?: (url: string) => string;
    getURL?: () => string;
    implementation?: string;
    rootURL: string;
  };
}

/**
 * @private
 *
 * Get the current URL from the Ember router location.
 */
export function getLocationURL(location: EmberRouterMain['location']): string {
  if (!location?.getURL || !location?.formatURL) {
    return '';
  }

  const url = location.formatURL(location.getURL());

  // `implementation` is optional in Ember's predefined location types, so we also check if the URL starts with '#'.
  if (location.implementation === 'hash' || url.startsWith('#')) {
    return `${location.rootURL}${url}`;
  }

  return url;
}

/**
 * @private
 */
export function getTransitionInformation(
  transition: Transition,
  router: RouterService,
): {
  fromRoute: string | undefined;
  toRoute: string | undefined;
} {
  const fromRoute = transition?.from?.name as string | undefined;

  const toRoute =
    (transition?.to?.name as string | undefined) ??
    router.currentRouteName ??
    undefined;

  return {
    fromRoute,
    toRoute,
  };
}

/**
 * @private
 */
export function isTransitionIntermediate(transition: Transition): boolean {
  // We want to use ignore, as this may actually be defined on new versions
  const isIntermediate: boolean | undefined = transition.isIntermediate;

  if (typeof isIntermediate === 'boolean') {
    return isIntermediate;
  }

  // For versions without this, we look if the route is a `.loading` or `.error` route
  // This is not perfect and may false-positive in some cases, but it's the best we can do
  return (
    transition.to?.localName === 'loading' ||
    transition.to?.localName === 'error'
  );
}
