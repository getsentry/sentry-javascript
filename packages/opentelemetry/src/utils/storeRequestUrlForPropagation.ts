const REQUEST_URL_PROP = '__requestUrl';

/**
 * This mutates a given carrier object (usually an headers POJO) and sets a special property on it that the propagator can use
 * to get the URL for the request.
 * This is pretty hacky but necessary for us to check outgoing requests agains tracePropagationTargets.
 * Without this, we cannot access the URL for the outgoing request in the propagator, sadly - we only have access to the carrier.
 * We need to make sure to remove this again in the propagator, to not send this header out.
 */
export function storeRequestUrlOnPropagationCarrier(carrier: { [key: string]: unknown }, url: string): void {
  // Can't use a non-enumerable property because http instrumentation clones this
  // We remove this in the propagator
  carrier[REQUEST_URL_PROP] = url;
}

/**
 * Get the request URL from the carrier object, if it was set by storeRequestUrlOnPropagationCarrier.
 * Additionally, also remove the property from the carrier object, to avoid it being sent out.
 */
export function getAndCleanRequestUrlFromPropagationCarrier(carrier: { [key: string]: unknown }): string | undefined {
  try {
    if (typeof carrier[REQUEST_URL_PROP] === 'string') {
      const url = carrier[REQUEST_URL_PROP];
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete carrier[REQUEST_URL_PROP];
      return url;
    }
  } catch {
    // ignore errors here
  }
  return undefined;
}
