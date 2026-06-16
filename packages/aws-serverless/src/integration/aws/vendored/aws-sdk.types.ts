/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-aws-sdk
 * - Upstream version: @opentelemetry/instrumentation-aws-sdk@0.73.0
 */

/*
 * AWS SDK for JavaScript
 * Copyright 2012-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * This product includes software developed at
 * Amazon Web Services, Inc. (http://aws.amazon.com/).
 */

/*
  These are slightly modified and simplified versions of the actual SQS types included
  in the official distribution:
  https://github.com/aws/aws-sdk-js/blob/master/clients/sqs.d.ts
  These are brought here to avoid having users install the `aws-sdk` whenever they
  require this instrumentation.
*/

interface Blob {}
type Binary = Buffer | Uint8Array | Blob | string;

// eslint-disable-next-line @typescript-eslint/no-namespace -- Prefer to contain the types copied over in one location
export namespace SNS {
  interface MessageAttributeValue {
    /**
     * Amazon SNS supports the following logical data types: String, String.Array, Number, and Binary. For more information, see Message Attribute Data Types.
     */
    DataType: string;
    /**
     * Strings are Unicode with UTF8 binary encoding. For a list of code values, see ASCII Printable Characters.
     */
    StringValue?: string;
    /**
     * Binary type attributes can store any binary data, for example, compressed data, encrypted data, or images.
     */
    BinaryValue?: Binary;
  }

  export type MessageAttributeMap = { [key: string]: MessageAttributeValue };
}

// eslint-disable-next-line @typescript-eslint/no-namespace -- Prefer to contain the types copied over in one location
export namespace SQS {
  type StringList = string[];
  type BinaryList = Binary[];
  interface MessageAttributeValue {
    /**
     * Strings are Unicode with UTF-8 binary encoding. For a list of code values, see ASCII Printable Characters.
     */
    StringValue?: string;
    /**
     * Binary type attributes can store any binary data, such as compressed data, encrypted data, or images.
     */
    BinaryValue?: Binary;
    /**
     * Not implemented. Reserved for future use.
     */
    StringListValues?: StringList;
    /**
     * Not implemented. Reserved for future use.
     */
    BinaryListValues?: BinaryList;
    /**
     * Amazon SQS supports the following logical data types: String, Number, and Binary. For the Number data type, you must use StringValue. You can also append custom labels. For more information, see Amazon SQS Message Attributes in the Amazon SQS Developer Guide.
     */
    DataType: string;
  }

  export type MessageBodyAttributeMap = {
    [key: string]: MessageAttributeValue;
  };

  type MessageSystemAttributeMap = { [key: string]: string };

  export interface Message {
    /**
     * A unique identifier for the message. A MessageId is considered unique across all accounts for an extended period of time.
     */
    MessageId?: string;
    /**
     * An identifier associated with the act of receiving the message. A new receipt handle is returned every time you receive a message. When deleting a message, you provide the last received receipt handle to delete the message.
     */
    ReceiptHandle?: string;
    /**
     * An MD5 digest of the non-URL-encoded message body string.
     */
    MD5OfBody?: string;
    /**
     * The message's contents (not URL-encoded).
     */
    Body?: string;
    /**
     * A map of the attributes requested in  ReceiveMessage  to their respective values. Supported attributes:    ApproximateReceiveCount     ApproximateFirstReceiveTimestamp     MessageDeduplicationId     MessageGroupId     SenderId     SentTimestamp     SequenceNumber     ApproximateFirstReceiveTimestamp and SentTimestamp are each returned as an integer representing the epoch time in milliseconds.
     */
    Attributes?: MessageSystemAttributeMap;
    /**
     * An MD5 digest of the non-URL-encoded message attribute string. You can use this attribute to verify that Amazon SQS received the message correctly. Amazon SQS URL-decodes the message before creating the MD5 digest. For information about MD5, see RFC1321.
     */
    MD5OfMessageAttributes?: string;
    /**
     * Each message attribute consists of a Name, Type, and Value. For more information, see Amazon SQS message attributes in the Amazon SQS Developer Guide.
     */
    MessageAttributes?: MessageBodyAttributeMap;
  }
}
