import Component from '@ember/component';
import { computed } from '@ember/object';

export default Component.extend({
  rowItems: computed('items', function() {
    return new Array(parseInt(this.items)).fill(0).map((_, index) => {
      return {
        index: index + 1,
      };
    });
  }),
});
