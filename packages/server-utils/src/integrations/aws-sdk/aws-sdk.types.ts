/*
 * AWS SDK for JavaScript
 * Copyright 2012-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * This product includes software developed at
 * Amazon Web Services, Inc. (http://aws.amazon.com/).
 */

/*
  These are slightly modified and simplified versions of the actual SQS/SNS types included
  in the official distribution:
  https://github.com/aws/aws-sdk-js/blob/master/clients/sqs.d.ts
  These are brought here to avoid having users install the `aws-sdk` whenever they
  require this instrumentation.
*/

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface Blob {}
type Binary = Buffer | Uint8Array | Blob | string;

// eslint-disable-next-line @typescript-eslint/no-namespace -- Prefer to contain the types copied over in one location
export namespace SNS {
  interface MessageAttributeValue {
    DataType: string;
    StringValue?: string;
    BinaryValue?: Binary;
  }

  export type MessageAttributeMap = { [key: string]: MessageAttributeValue };
}

// eslint-disable-next-line @typescript-eslint/no-namespace -- Prefer to contain the types copied over in one location
export namespace SQS {
  type StringList = string[];
  type BinaryList = Binary[];
  interface MessageAttributeValue {
    StringValue?: string;
    BinaryValue?: Binary;
    StringListValues?: StringList;
    BinaryListValues?: BinaryList;
    DataType: string;
  }

  export type MessageBodyAttributeMap = {
    [key: string]: MessageAttributeValue;
  };

  type MessageSystemAttributeMap = { [key: string]: string };

  export interface Message {
    MessageId?: string;
    ReceiptHandle?: string;
    MD5OfBody?: string;
    Body?: string;
    Attributes?: MessageSystemAttributeMap;
    MD5OfMessageAttributes?: string;
    MessageAttributes?: MessageBodyAttributeMap;
  }
}
