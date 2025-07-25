# Simple Usage Examples

This directory contains practical examples demonstrating how to use the Gemini CLI core functionality for building JavaScript adapters.

## Examples

### 1. Headless Gemini Adapter (`headless-gemini-adapter.ts`)

A comprehensive TypeScript implementation showing all the patterns from the guide:

- Basic headless client setup
- Error handling and retry logic
- Test automation patterns
- Agent context generation
- Chat history management
- Complete testing framework

### 2. Basic Node.js Usage

For a simple Node.js example, you can use the following pattern:

```javascript
// example-usage.mjs
import { createContentGenerator, AuthType } from '@google/gemini-cli-core';

const contentGenerator = createContentGenerator({
  model: 'gemini-2.5-pro-001',
  apiKey: process.env.GEMINI_API_KEY,
  authType: AuthType.USE_GEMINI
});

async function generateText(prompt) {
  try {
    const response = await contentGenerator.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    
    return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (error) {
    console.error('Generation failed:', error.message);
    throw error;
  }
}

// Usage
const result = await generateText('Generate 3 test cases for a login API');
console.log(result);
```

### 3. Test Automation Example

```javascript
// test-automation.mjs
import { createContentGenerator, AuthType } from '@google/gemini-cli-core';

class TestAutomation {
  constructor(apiKey) {
    this.contentGenerator = createContentGenerator({
      model: 'gemini-2.5-pro-001',
      apiKey,
      authType: AuthType.USE_GEMINI
    });
  }

  async generateTestCases(specification) {
    const prompt = `Generate test cases for: ${specification}

Return JSON format:
{
  "testCases": [
    {
      "name": "test name",
      "input": "test input",
      "expected": "expected output",
      "category": "positive|negative|edge_case"
    }
  ]
}`;

    const response = await this.contentGenerator.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return JSON.parse(text);
  }

  async analyzeResults(testResults) {
    const prompt = `Analyze test results: ${JSON.stringify(testResults)}
    
Provide analysis in JSON format with summary and recommendations.`;

    const response = await this.contentGenerator.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return JSON.parse(text);
  }
}

// Usage
const automation = new TestAutomation(process.env.GEMINI_API_KEY);
const testCases = await automation.generateTestCases('User login API endpoint');
console.log(testCases);
```

## Running the Examples

1. Set your API key:
   ```bash
   export GEMINI_API_KEY="your-api-key-here"
   ```

2. For TypeScript examples, compile first:
   ```bash
   npx tsc headless-gemini-adapter.ts --target es2020 --module node16 --moduleResolution node16
   ```

3. Run with Node.js:
   ```bash
   node headless-gemini-adapter.js
   ```

## Key Patterns Demonstrated

- **Authentication**: Using API keys with different auth types
- **Error Handling**: Retry logic and fallback mechanisms  
- **Streaming**: Real-time response streaming
- **Tool Integration**: Adding custom tools and capabilities
- **Context Management**: Managing conversation history and compression
- **Test Automation**: Generating test cases and analyzing results
- **Agent Coordination**: Feeding context between different agents

## Best Practices

1. Always handle errors and implement retry logic
2. Use appropriate models for your use case (Pro vs Flash)
3. Manage token limits with compression
4. Validate JSON responses when requesting structured data
5. Implement proper logging and telemetry
6. Use environment variables for configuration
7. Test connectivity and authentication before main operations

For complete implementation details, see the [JavaScript Adapter Guide](../javascript-adapter-guide.md) and [Quick Reference](../javascript-adapter-quick-reference.md).