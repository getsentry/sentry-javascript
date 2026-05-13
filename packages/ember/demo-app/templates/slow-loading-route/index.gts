import SlowLoadingList from '../../components/slow-loading-list.gts';

import type { TOC } from '@ember/component/template-only';

export interface Signature {
  Args: {
    model: { items: string[] };
  };
}

const SlowLoadingRouteIndex: TOC<Signature> = <template>
  <h2>Slow Loading Route Index</h2>
  <SlowLoadingList @items={{@model.items}} />
</template>;

export default SlowLoadingRouteIndex;
