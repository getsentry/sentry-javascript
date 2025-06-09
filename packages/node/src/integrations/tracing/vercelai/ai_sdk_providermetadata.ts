/**
 * OpenAI Provider Metadata
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/openai
 * @see https://github.com/vercel/ai/blob/65e042afde6aad4da9d7a62526ece839eb34f9a5/packages/openai/src/openai-chat-language-model.ts#L397-L416
 * @see https://github.com/vercel/ai/blob/65e042afde6aad4da9d7a62526ece839eb34f9a5/packages/openai/src/responses/openai-responses-language-model.ts#L377C7-L384
 */
interface OpenAiProviderMetadata {
  /**
   * The number of predicted output tokens that were accepted.
   * @see https://ai-sdk.dev/providers/ai-sdk-providers/openai#predicted-outputs
   */
  acceptedPredictionTokens?: number;

  /**
   * The number of predicted output tokens that were rejected.
   * @see https://ai-sdk.dev/providers/ai-sdk-providers/openai#predicted-outputs
   */
  rejectedPredictionTokens?: number;

  /**
   * The number of reasoning tokens that the model generated.
   * @see https://ai-sdk.dev/providers/ai-sdk-providers/openai#responses-models
   */
  reasoningTokens?: number;

  /**
   * The number of prompt tokens that were a cache hit.
   * @see https://ai-sdk.dev/providers/ai-sdk-providers/openai#responses-models
   */
  cachedPromptTokens?: number;

  /**
   * @see https://ai-sdk.dev/providers/ai-sdk-providers/openai#responses-models
   *
   * The ID of the response. Can be used to continue a conversation.
   */
  responseId?: string;
}

/**
 * Anthropic Provider Metadata
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
 * @see https://github.com/vercel/ai/blob/65e042afde6aad4da9d7a62526ece839eb34f9a5/packages/anthropic/src/anthropic-messages-language-model.ts#L346-L352
 */
interface AnthropicProviderMetadata {
  /**
   * The number of tokens that were used to create the cache.
   * @see https://ai-sdk.dev/providers/ai-sdk-providers/anthropic#cache-control
   */
  cacheCreationInputTokens?: number;

  /**
   * The number of tokens that were read from the cache.
   * @see https://ai-sdk.dev/providers/ai-sdk-providers/anthropic#cache-control
   */
  cacheReadInputTokens?: number;
}

/**
 * Amazon Bedrock Provider Metadata
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock
 * @see https://github.com/vercel/ai/blob/65e042afde6aad4da9d7a62526ece839eb34f9a5/packages/amazon-bedrock/src/bedrock-chat-language-model.ts#L263-L280
 */
interface AmazonBedrockProviderMetadata {
  /**
   * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ConverseTrace.html
   */
  trace?: {
    /**
     * The guardrail trace object.
     * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_GuardrailTraceAssessment.html
     *
     * This was purposely left as unknown as it's a complex object. This can be typed in the future
     * if the SDK decides to support bedrock in a more advanced way.
     */
    guardrail?: unknown;
    /**
     * The request's prompt router.
     * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_PromptRouterTrace.html
     */
    promptRouter?: {
      /**
       * The ID of the invoked model.
       */
      invokedModelId?: string;
    };
  };
  usage?: {
    /**
     * The number of tokens that were read from the cache.
     * @see https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock#cache-points
     */
    cacheReadInputTokens?: number;

    /**
     * The number of tokens that were written to the cache.
     * @see https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock#cache-points
     */
    cacheWriteInputTokens?: number;
  };
}

/**
 * Google Generative AI Provider Metadata
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai
 */
export interface GoogleGenerativeAIProviderMetadata {
  /**
   * @see https://github.com/vercel/ai/blob/65e042afde6aad4da9d7a62526ece839eb34f9a5/packages/google/src/google-generative-ai-prompt.ts#L28-L30
   */
  groundingMetadata: null | {
    /**
     * Array of search queries used to retrieve information
     * @example ["What's the weather in Chicago this weekend?"]
     *
     * @see https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai#search-grounding
     */
    webSearchQueries: string[] | null;
    /**
     * Contains the main search result content used as an entry point
     * The `renderedContent` field contains the formatted content
     * @see https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai#search-grounding
     */
    searchEntryPoint?: {
      renderedContent: string;
    } | null;
    /**
     * Contains details about how specific response parts are supported by search results
     * @see https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai#search-grounding
     */
    groundingSupports: Array<{
      /**
       * Information about the grounded text segment.
       */
      segment: {
        /**
         * The start index of the text segment.
         */
        startIndex?: number | null;
        /**
         * The end index of the text segment.
         */
        endIndex?: number | null;
        /**
         * The actual text segment.
         */
        text?: string | null;
      };
      /**
       * References to supporting search result chunks.
       */
      groundingChunkIndices?: number[] | null;
      /**
       * Confidence scores (0-1) for each supporting chunk.
       */
      confidenceScores?: number[] | null;
    }> | null;
  };
  /**
   * @see https://github.com/vercel/ai/blob/65e042afde6aad4da9d7a62526ece839eb34f9a5/packages/google/src/google-generative-ai-language-model.ts#L620-L627
   * @see https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/configure-safety-filters
   */
  safetyRatings?: null | unknown;
}

/**
 * DeepSeek Provider Metadata
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/deepseek
 */
interface DeepSeekProviderMetadata {
  /**
   * The number of tokens that were cache hits.
   * @see https://ai-sdk.dev/providers/ai-sdk-providers/deepseek#cache-token-usage
   */
  promptCacheHitTokens?: number;

  /**
   * The number of tokens that were cache misses.
   * @see https://ai-sdk.dev/providers/ai-sdk-providers/deepseek#cache-token-usage
   */
  promptCacheMissTokens?: number;
}

/**
 * Perplexity Provider Metadata
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/perplexity
 */
interface PerplexityProviderMetadata {
  /**
   * Object containing citationTokens and numSearchQueries metrics
   */
  usage?: {
    citationTokens?: number;
    numSearchQueries?: number;
  };
  /**
   * Array of image URLs when return_images is enabled.
   *
   * You can enable image responses by setting return_images: true in the provider options.
   * This feature is only available to Perplexity Tier-2 users and above.
   */
  images?: Array<{
    imageUrl?: string;
    originUrl?: string;
    height?: number;
    width?: number;
  }>;
}

export interface ProviderMetadata {
  openai?: OpenAiProviderMetadata;
  anthropic?: AnthropicProviderMetadata;
  bedrock?: AmazonBedrockProviderMetadata;
  google?: GoogleGenerativeAIProviderMetadata;
  deepseek?: DeepSeekProviderMetadata;
  perplexity?: PerplexityProviderMetadata;
}
