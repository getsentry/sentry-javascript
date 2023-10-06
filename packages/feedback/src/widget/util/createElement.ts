    /**
     *
     */
    export function createElement<K extends keyof HTMLElementTagNameMap>(tagName: K, attributes: {[key: string]: string|boolean|EventListenerOrEventListenerObject}| null, ...children: any): HTMLElementTagNameMap[K] {
        const element = document.createElement(tagName);

        if (attributes) {
          Object.entries(attributes).forEach(([attribute, attributeValue]) => {
            if (attribute === 'className' && typeof attributeValue === 'string') { // JSX does not allow class as a valid name
              element.setAttribute('class', attributeValue);
            } else if (typeof attributeValue === 'boolean' && attributeValue) {
              element.setAttribute(attribute, '');
            } else if (typeof attributeValue === 'string'){
              element.setAttribute(attribute, attributeValue);
            } else if (attribute.startsWith('on') && typeof attributeValue === 'function') {
              element.addEventListener(attribute.substring(2).toLowerCase(), attributeValue);
            }
          })
        }
        Object.values(children).forEach(child => appendChild(element, child))

        return element;
    }

    function appendChild(parent: Node, child: any) {
        if (typeof child === 'undefined' || child === null) {
            return;
        }

        if (Array.isArray(child)) {
            for (const value of child) {
                appendChild(parent, value);
            }
        } else if (typeof child === 'string') {
            parent.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            parent.appendChild(child);
        } else {
            parent.appendChild(document.createTextNode(String(child)));
        }
    }

// export function createElement(tagName: keyof HTMLElementTagNameMap, attributes: Record<string, string>, ...children: HTMLElement[]) {
//   const el = document.createElement(tagName)
//   Object.entries(attributes).forEach(([key, val]) => el[key] = val);
//   children.forEach(child => el.appendChild(child));
//   return el;
// }

// const form = createElement('form');

  // c('form', {},
  //   c('input', {}),
  // )
