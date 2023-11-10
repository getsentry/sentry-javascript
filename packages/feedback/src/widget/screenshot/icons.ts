import { WINDOW } from '@sentry/browser';

const XMLNS = 'http://www.w3.org/2000/svg';

const createElementNS = <K extends keyof SVGElementTagNameMap>(
  tagName: K,
  attributes: { [key: string]: string | boolean | EventListenerOrEventListenerObject } | null,
  ...children: any
): SVGElementTagNameMap[K] => {
  const doc = WINDOW.document;

  const el = doc.createElementNS(XMLNS, tagName);

  if (attributes) {
    Object.entries(attributes).forEach(([attribute, attributeValue]) => {
      if (attribute === 'className' && typeof attributeValue === 'string') {
        // JSX does not allow class as a valid name
        el.setAttributeNS(null, 'class', attributeValue);
      } else if (typeof attributeValue === 'boolean' && attributeValue) {
        el.setAttributeNS(null, attribute, '');
      } else if (typeof attributeValue === 'string') {
        el.setAttributeNS(null, attribute, attributeValue);
      } else if (attribute.startsWith('on') && typeof attributeValue === 'function') {
        el.addEventListener(attribute.substring(2).toLowerCase(), attributeValue);
      }
    });
  }

  for (const child of children) {
    appendChild(el, child);
  }

  return el;
};

function appendChild(parent: Node, child: any): void {
  if (typeof child === 'undefined' || child === null) {
    return;
  }

  if (Array.isArray(child)) {
    for (const value of child) {
      appendChild(parent, value);
    }
  } else if (child === false) {
    // do nothing if child evaluated to false
  } else {
    parent.appendChild(child);
  }
}

export interface IconComponent {
  el: SVGSVGElement;
}

/**
 *
 */
export function PenIcon(): IconComponent {
  return {
    get el() {
      return createElementNS(
        'svg',
        {
          width: '16',
          height: '16',
          viewBox: '0 0 16 16',
          fill: 'none',
        },
        createElementNS('path', {
          d: 'M8.5 12L12 8.5L14 11L11 14L8.5 12Z',
          stroke: 'currentColor',
          'stroke-width': '1.5',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
        createElementNS('path', {
          d: 'M12 8.5L11 3.5L2 2L3.5 11L8.5 12L12 8.5Z',
          stroke: 'currentColor',
          'stroke-width': '1.5',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
        createElementNS('path', {
          d: 'M2 2L7.5 7.5',
          stroke: 'currentColor',
          'stroke-width': '1.5',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
      );
    },
  };
}

/**
 *
 */
export function RectangleIcon(): IconComponent {
  return {
    get el() {
      return createElementNS(
        'svg',
        {
          width: '16',
          height: '16',
          viewBox: '0 0 16 16',
          fill: 'none',
        },
        createElementNS('rect', {
          x: '2.5',
          y: '2.5',
          width: '11',
          height: '11',
          rx: '2',
          stroke: 'currentColor',
          'stroke-width': '1.5',
        }),
      );
    },
  };
}

/**
 *
 */
export function ArrowIcon(): IconComponent {
  return {
    get el() {
      return createElementNS(
        'svg',
        {
          width: '16',
          height: '16',
          viewBox: '0 0 16 16',
          fill: 'none',
        },
        createElementNS('path', {
          d: 'M2.5 2.5L13 13',
          stroke: 'currentColor',
          'stroke-width': '1.5',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
        createElementNS('path', {
          d: 'M8.5 2.5H2.5L2.5 8.5',
          stroke: 'currentColor',
          'stroke-width': '1.5',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
      );
    },
  };
}

/**
 *
 */
export function HandIcon(): IconComponent {
  return {
    get el() {
      return createElementNS(
        'svg',
        {
          width: '16',
          height: '16',
          viewBox: '0 0 16 16',
          fill: 'none',
        },
        createElementNS('path', {
          d: 'M2 2L6.5 14.5L8.5 8.5L14.5 6.5L2 2Z',
          stroke: 'currentColor',
          'stroke-width': '1.5',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
      );
    },
  };
}
