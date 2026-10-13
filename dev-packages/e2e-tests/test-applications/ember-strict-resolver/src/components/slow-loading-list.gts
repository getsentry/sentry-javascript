import type { TOC } from '@ember/component/template-only';

export interface SlowLoadingListSignature {
  Args: {
    items: string[];
  };
}

const SlowLoadingList: TOC<SlowLoadingListSignature> = <template>
  <ul data-test-slow-loading-list>
    {{#each @items as |item|}}
      <li>{{item}}</li>
    {{/each}}
  </ul>
</template>;

export default SlowLoadingList;
