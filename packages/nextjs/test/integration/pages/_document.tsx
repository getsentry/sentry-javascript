import Document, { DocumentContext } from 'next/document';

class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    // Verify that wrapping correctly passes `this`
    this.testFunction();

    const initialProps = await Document.getInitialProps(ctx);

    return initialProps;
  }

  static testFunction() {
    // noop
  }
}

export default MyDocument;
