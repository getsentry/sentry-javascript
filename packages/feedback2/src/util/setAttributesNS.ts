/**
 * Helper function to set a dict of attributes on element (w/ specified namespace)
 */
export function setAttributesNS<T extends SVGElement>(el: T, attributes: Record<string, string>): T {
  Object.entries(attributes).forEach(([key, val]) => {
    el.setAttributeNS(null, key, val);
  });
  return el;
}
