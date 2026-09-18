import { on } from '@ember/modifier';

import type { TOC } from '@ember/component/template-only';

interface TestSectionSignature {
  Args: {
    title: string;
    buttonLabel: string;
    buttonFunction: () => void;
  };
}

const TestSection: TOC<TestSectionSignature> = <template>
  <div class="section">
    <h4>{{@title}}</h4>
    <button type="button" {{on "click" @buttonFunction}} data-test-button={{@title}}>
      {{@buttonLabel}}
    </button>
  </div>
</template>;

export default TestSection;
