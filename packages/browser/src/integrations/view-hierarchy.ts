import type { Attachment, Event, ViewHierarchyData, ViewHierarchyWindow } from '@sentry/core';
import { defineIntegration, getComponentName } from '@sentry/core';
import { WINDOW } from '../helpers';

interface OnElementArgs {
  /**
   * The element being processed.
   */
  element: HTMLElement;
  /**
   * Lowercase tag name of the element.
   */
  tagName: string;
  /**
   * The component name of the element.
   */
  componentName?: string;
}

interface Options {
  /**
   * Whether to attach the view hierarchy to the event.
   *
   * Default: Always attach.
   */
  shouldAttach?: (event: Event) => boolean;

  /**
   * Called for each HTMLElement as we walk the DOM.
   *
   * Return an object to include the element with any additional properties.
   * Return `skip` to exclude the element and its children.
   * Return `children` to skip the element but include its children.
   */
  onElement?: (prop: OnElementArgs) => Record<string, string | number | boolean> | 'skip' | 'children';
}

/**
 * An integration to include a view hierarchy attachment which contains the DOM.
 */
export const viewHierarchyIntegration = defineIntegration((options: Options = {}) => {
  const skipHtmlTags = ['script'];

  /** Walk an element */
  function walk(element: HTMLElement, windows: ViewHierarchyWindow[]): void {
    // With Web Components, we need walk into shadow DOMs
    const children = 'shadowRoot' in element && element.shadowRoot ? element.shadowRoot.children : element.children;

    for (const child of children) {
      if (!(child instanceof HTMLElement)) {
        continue;
      }

      const componentName = getComponentName(child) || undefined;
      const tagName = child.tagName.toLowerCase();

      if (skipHtmlTags.includes(tagName)) {
        continue;
      }

      const result = options.onElement?.({ element: child, componentName, tagName }) || {};

      if (result === 'skip') {
        continue;
      }

      // Skip this element but include its children
      if (result === 'children') {
        walk(child, windows);
        continue;
      }

      const { x, y, width, height } = child.getBoundingClientRect();

      const window: ViewHierarchyWindow = {
        identifier: (child.id || undefined) as string,
        type: componentName || tagName,
        visible: true,
        alpha: 1,
        height,
        width,
        x,
        y,
        ...result,
      };

      const children: ViewHierarchyWindow[] = [];
      window.children = children;

      // Recursively walk the children
      walk(child, window.children);

      windows.push(window);
    }
  }

  return {
    name: 'ViewHierarchy',
    processEvent: (event, hint) => {
      if (options.shouldAttach && options.shouldAttach(event) === false) {
        return event;
      }

      const root: ViewHierarchyData = {
        rendering_system: 'DOM',
        positioning: 'absolute',
        windows: [],
      };

      walk(WINDOW.document.body, root.windows);

      const attachment: Attachment = {
        filename: 'view-hierarchy.json',
        attachmentType: 'event.view_hierarchy',
        contentType: 'application/json',
        data: JSON.stringify(root),
      };

      hint.attachments = hint.attachments || [];
      hint.attachments.push(attachment);

      return event;
    },
  };
});
