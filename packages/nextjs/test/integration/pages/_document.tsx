import Document, { DocumentContext } from 'next/document';

class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    this.testFunction();

    const initialProps = await Document.getInitialProps(ctx);

    return initialProps;
  }

  static testFunction() {
    console.log('Calling me with this should not throw after wrapping');
  }
}

export default MyDocument;
