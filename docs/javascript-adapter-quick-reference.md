# Quick Reference: Gemini JavaScript Adapter Patterns

This is a condensed reference guide for the most common patterns when building JavaScript adapters for Gemini. For the complete guide, see [javascript-adapter-guide.md](./javascript-adapter-guide.md).

## Essential Imports

```typescript
import {
  Config,
  GeminiClient,
  ToolRegistry,
  createContentGenerator,
  AuthType,
  ContentGeneratorConfig,
  retryWithBackoff,
  tokenLimit
} from '@google/gemini-cli-core';
```

## Basic Setup Patterns

### 1. Simple API Key Setup
```typescript
const adapter = new HeadlessGeminiAdapter({
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-2.5-pro-001',
  authType: AuthType.USE_GEMINI
});
```

### 2. Vertex AI Setup
```typescript
const adapter = new HeadlessGeminiAdapter({
  apiKey: process.env.GOOGLE_API_KEY,
  model: 'gemini-2.5-pro-001',
  authType: AuthType.USE_VERTEX_AI
});
```

## Common Operations

### Generate Text Response
```typescript
const response = await adapter.generateResponse("Your prompt here");
```

### Generate Structured Data
```typescript
const jsonResponse = await adapter.generateJSON<YourType>(
  "Generate data matching this schema...",
  "JSON schema definition"
);
```

### Stream Response
```typescript
for await (const chunk of adapter.generateStreamingResponse("Your prompt")) {
  console.log(chunk);
}
```

## Error Handling Pattern

```typescript
try {
  const result = await retryWithBackoff(
    () => adapter.generateResponse(prompt),
    3,     // max retries
    1000,  // base delay
    10000  // max delay
  );
} catch (error) {
  if (error.message.includes('429')) {
    // Handle rate limiting
  } else if (error.message.includes('quota')) {
    // Handle quota exceeded
  } else {
    // Handle other errors
  }
}
```

## Tool Integration

### Custom Tool
```typescript
class MyTool extends BaseTool {
  name = 'my_tool';
  description = 'My custom tool';
  parameterSchema = {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'Input data' }
    },
    required: ['input']
  };

  async execute(params: any): Promise<ToolResult> {
    // Your tool logic here
    return {
      llmContent: 'Tool execution result',
      returnDisplay: 'User-friendly display'
    };
  }
}

// Register the tool
toolRegistry.register(new MyTool());
```

## MCP Integration

```typescript
const mcpAdapter = new MCPIntegratedAdapter(config);
await mcpAdapter.initializeMCPServers([
  {
    name: 'my-server',
    command: 'node my-mcp-server.js'
  }
]);
```

## Test Automation Pattern

```typescript
const testFramework = new HeadlessTestingFramework({
  apiKey: process.env.GEMINI_API_KEY,
  enableTelemetry: true
});

const result = await testFramework.runTestCycle(specification);
console.log('Test results:', result.validationReport);
```

## Agent Context Pattern

```typescript
const contextGen = new AgentContextGenerator({
  apiKey: process.env.GEMINI_API_KEY
});

const context = await contextGen.generateContextForAgent(
  'agent-id',
  'task description',
  previousResults,
  domainKnowledge
);
```

## Configuration Best Practices

### Environment Variables
```bash
export GEMINI_API_KEY="your-api-key"
export GEMINI_MODEL="gemini-2.5-pro-001"
export GEMINI_MAX_RETRIES="3"
export HTTP_PROXY="http://proxy.example.com:8080"  # if needed
```

### Config Object
```typescript
const config = {
  model: 'gemini-2.5-pro-001',
  apiKey: process.env.GEMINI_API_KEY,
  authType: AuthType.USE_GEMINI,
  proxy: process.env.HTTP_PROXY,
  maxRetries: 3,
  timeout: 30000
};
```

## Token Management

```typescript
// Check token limits
const tokenCount = await contentGenerator.countTokens({
  contents: conversationHistory
});

const limit = tokenLimit(model);
const utilizationPercent = (tokenCount.totalTokens / limit) * 100;

if (utilizationPercent > 80) {
  // Compress history or switch models
  await compressConversationHistory();
}
```

## Model Fallback

```typescript
try {
  return await generateWithModel('gemini-2.5-pro-001', prompt);
} catch (error) {
  if (isRateLimitError(error)) {
    console.log('Falling back to Flash model');
    return await generateWithModel('gemini-2.5-flash-001', prompt);
  }
  throw error;
}
```

## Multimodal Input

```typescript
const parts = [
  { text: 'Analyze this image:' },
  {
    inlineData: {
      mimeType: 'image/jpeg',
      data: fs.readFileSync('image.jpg').toString('base64')
    }
  }
];

const response = await adapter.client.generateContent(parts);
```

## Troubleshooting Quick Checks

### 1. Test Authentication
```typescript
try {
  await contentGenerator.countTokens({
    contents: [{ role: 'user', parts: [{ text: 'test' }] }]
  });
  console.log('Auth OK');
} catch (error) {
  console.error('Auth failed:', error.message);
}
```

### 2. Test Connectivity
```typescript
const response = await fetch('https://generativelanguage.googleapis.com');
console.log('API reachable:', response.ok);
```

### 3. Check Rate Limits
```typescript
const isRateLimited = error.message.includes('429') || 
                     error.message.includes('rate limit');
```

## Complete Minimal Example

```typescript
import { HeadlessGeminiAdapter, AuthType } from '@google/gemini-cli-core';

async function main() {
  const adapter = new HeadlessGeminiAdapter({
    apiKey: process.env.GEMINI_API_KEY,
    authType: AuthType.USE_GEMINI
  });

  try {
    const response = await adapter.generateResponse(
      "Generate 5 test cases for a login API endpoint"
    );
    console.log(response);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
```

## Key Architecture Principles

1. **Headless Operation**: All core functionality works without UI
2. **Tool Extensibility**: Easy to add custom tools and MCP integrations
3. **Error Resilience**: Built-in retry logic and fallback mechanisms
4. **Multiple Auth**: Support for API keys, OAuth, and Vertex AI
5. **Token Management**: Automatic compression and limit handling
6. **Streaming Support**: Real-time response streaming
7. **Configuration Driven**: Environment-based configuration
8. **Telemetry Ready**: Built-in monitoring and metrics

For detailed examples and advanced patterns, see the complete [JavaScript Adapter Guide](./javascript-adapter-guide.md).