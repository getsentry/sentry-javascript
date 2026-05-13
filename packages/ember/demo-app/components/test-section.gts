import type { TOC } from '@ember/component/template-only';

export interface TestSectionSignature {
  Args: {
    title: string;
  };
}

const TestSection: TOC<TestSectionSignature> = <template>
  <section class="test-section">
    <h3>{{@title}}</h3>
    <p>This is a tracked component for performance testing.</p>
  </section>
</template>;

export default TestSection;
