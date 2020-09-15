import Component from '@ember/component';
import { computed } from '@ember/object';

export default Component.extend({
  _title: computed('title', function() {
    return this.title || 'Slow Loading List';
  }),
  rowItems: computed('items', function() {
    return new Array(parseInt(this.items)).fill(0).map((_, index) => {
      return {
        index: index + 1,
      };
    });
  }),
});
