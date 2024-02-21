/* eslint-disable ember/no-classic-classes */
/* eslint-disable ember/no-classic-components */
import Component from '@ember/component';
import { computed } from '@ember/object';

interface Args {
  title?: string;
  items: number;
}

export default Component.extend({
  tagName: '',

  _title: computed('title', function () {
    return (this as Args).title || 'Slow Loading List';
  }),

  rowItems: computed('items', function () {
    return new Array((this as Args).items).fill(0).map((_, index) => {
      return {
        index: index + 1,
      };
    });
  }),
});
