# Comprehensive Guide: Building JavaScript Adapters for Advanced Gemini Usage

This guide provides a comprehensive reference for building JavaScript adapters for advanced Gemini usage, specifically designed for headless operation, test automation, and feeding context to other agents. Based on the Gemini CLI source code analysis, this document outlines the patterns, architectures, and best practices for creating production-ready Gemini adapters.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Authentication Strategies](#authentication-strategies)
4. [Basic Client Setup](#basic-client-setup)
5. [Content Generation Patterns](#content-generation-patterns)
6. [Tool Integration and MCP Support](#tool-integration-and-mcp-support)
7. [Error Handling and Retry Logic](#error-handling-and-retry-logic)
8. [Advanced Features](#advanced-features)
9. [Complete Working Examples](#complete-working-examples)
10. [Best Practices for Test Automation](#best-practices-for-test-automation)
11. [Troubleshooting](#troubleshooting)

## Architecture Overview

The Gemini CLI's core architecture provides a robust foundation for building JavaScript adapters. The key architectural principles are:

- **Separation of Concerns**: Clear separation between client logic, content generation, tool execution, and configuration
- **Headless by Design**: Core functionality operates independently of UI components
- **Extensible Tool System**: Plugin-based architecture for adding custom capabilities
- **Multiple Authentication Methods**: Support for various authentication strategies
- **Comprehensive Error Handling**: Built-in retry logic and error recovery mechanisms

### Key Packages and Modules

```
packages/core/src/
├── core/           # Core client logic and content generation
├── config/         # Configuration management
├── tools/          # Tool definitions and registry
├── mcp/           # Model Context Protocol support
├── services/      # Supporting services (file discovery, git, etc.)
├── utils/         # Utility functions
└── telemetry/     # Usage tracking and metrics
```

## Core Components

### 1. ContentGenerator Interface

The `ContentGenerator` interface is the core abstraction for Gemini API interaction:

```typescript
interface ContentGenerator {
  generateContent(request: GenerateContentParameters): Promise<GenerateContentResponse>;
  generateContentStream(request: GenerateContentParameters): Promise<AsyncGenerator<GenerateContentResponse>>;
  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;
  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
  userTier?: UserTierId;
}
```

### 2. GeminiClient

The main orchestrator that coordinates content generation, tool execution, and conversation management:

```typescript
export class GeminiClient {
  constructor(
    config: Config,
    contentGenerator: ContentGenerator,
    toolRegistry: ToolRegistry,
    authType?: AuthType
  );
  
  async generateContent(request: GeminiCodeRequest): Promise<Turn>;
  async generateContentStream(request: GeminiCodeRequest): AsyncGenerator<ServerGeminiStreamEvent>;
  // ... additional methods
}
```

### 3. Configuration System

```typescript
export class Config {
  // Core configuration methods
  getModel(): string;
  getProxy(): string | undefined;
  setModel(model: string): void;
  
  // Tool and MCP configuration
  getToolDiscoveryCommand(): string | undefined;
  getMCPServers(): MCPServerConfig[];
  
  // Authentication and API settings
  // ... additional configuration methods
}
```

## Authentication Strategies

The Gemini CLI supports multiple authentication methods. Here's how to implement each:

### 1. API Key Authentication (Gemini API)

```typescript
import { createContentGenerator, AuthType, ContentGeneratorConfig } from '@google/gemini-cli-core';

// Set up configuration
const config: ContentGeneratorConfig = {
  model: 'gemini-2.5-pro-001',
  apiKey: process.env.GEMINI_API_KEY,
  authType: AuthType.USE_GEMINI
};

const contentGenerator = createContentGenerator(config);
```

### 2. Vertex AI Authentication

```typescript
const config: ContentGeneratorConfig = {
  model: 'gemini-2.5-pro-001',
  apiKey: process.env.GOOGLE_API_KEY,
  vertexai: true,
  authType: AuthType.USE_VERTEX_AI
};

const contentGenerator = createContentGenerator(config);
```

### 3. OAuth Personal Authentication

```typescript
const config: ContentGeneratorConfig = {
  model: 'gemini-2.5-pro-001',
  authType: AuthType.LOGIN_WITH_GOOGLE
};

const contentGenerator = createContentGenerator(config);
```

### 4. Cloud Shell Authentication

```typescript
const config: ContentGeneratorConfig = {
  model: 'gemini-2.5-pro-001',
  authType: AuthType.CLOUD_SHELL
};

const contentGenerator = createContentGenerator(config);
```

## Basic Client Setup

Here's a minimal setup for a headless Gemini client:

```typescript
import {
  Config,
  GeminiClient,
  ToolRegistry,
  createContentGenerator,
  AuthType,
  ContentGeneratorConfig
} from '@google/gemini-cli-core';

export class HeadlessGeminiAdapter {
  private client: GeminiClient;
  private config: Config;
  private toolRegistry: ToolRegistry;

  constructor(options: {
    apiKey?: string;
    model?: string;
    authType?: AuthType;
    workingDirectory?: string;
  }) {
    // Initialize configuration
    this.config = new Config();
    
    if (options.model) {
      this.config.setModel(options.model);
    }

    // Set up content generator
    const contentGeneratorConfig: ContentGeneratorConfig = {
      model: options.model || 'gemini-2.5-pro-001',
      apiKey: options.apiKey,
      authType: options.authType || AuthType.USE_GEMINI
    };

    const contentGenerator = createContentGenerator(contentGeneratorConfig);

    // Initialize tool registry with basic tools
    this.toolRegistry = new ToolRegistry(this.config);
    this.setupBasicTools();

    // Create the main client
    this.client = new GeminiClient(
      this.config,
      contentGenerator,
      this.toolRegistry,
      options.authType
    );
  }

  private setupBasicTools(): void {
    // Add essential tools for file system operations
    this.toolRegistry.register(new ReadFileTool());
    this.toolRegistry.register(new WriteFileTool());
    this.toolRegistry.register(new LSTool());
    this.toolRegistry.register(new GrepTool());
    this.toolRegistry.register(new GlobTool());
    this.toolRegistry.register(new ShellTool());
    this.toolRegistry.register(new WebFetchTool());
    this.toolRegistry.register(new WebSearchTool());
  }

  async generateResponse(prompt: string): Promise<string> {
    const turn = await this.client.generateContent([{ text: prompt }]);
    return turn.response?.text || '';
  }

  async generateStreamingResponse(prompt: string): AsyncGenerator<string> {
    const stream = this.client.generateContentStream([{ text: prompt }]);
    
    for await (const event of stream) {
      if (event.type === 'content' && event.content?.text) {
        yield event.content.text;
      }
    }
  }
}
```

## Content Generation Patterns

### 1. Simple Text Generation

```typescript
export class SimpleTextGenerator {
  constructor(private adapter: HeadlessGeminiAdapter) {}

  async generateText(prompt: string): Promise<string> {
    try {
      const response = await this.adapter.generateResponse(prompt);
      return response;
    } catch (error) {
      throw new Error(`Text generation failed: ${error.message}`);
    }
  }

  async generateWithContext(prompt: string, context: string): Promise<string> {
    const enhancedPrompt = `Context: ${context}\n\nRequest: ${prompt}`;
    return this.generateText(enhancedPrompt);
  }
}
```

### 2. Structured Data Generation

```typescript
export class StructuredDataGenerator {
  constructor(private adapter: HeadlessGeminiAdapter) {}

  async generateJSON<T>(prompt: string, schema: string): Promise<T> {
    const structuredPrompt = `
${prompt}

Please respond with valid JSON that matches this schema:
${schema}

Response (JSON only):
`;

    const response = await this.adapter.generateResponse(structuredPrompt);
    
    try {
      return JSON.parse(response) as T;
    } catch (error) {
      throw new Error(`Failed to parse JSON response: ${error.message}`);
    }
  }

  async generateTestCases(specification: string): Promise<TestCase[]> {
    const prompt = `
Generate comprehensive test cases for the following specification:

${specification}

Return the test cases as a JSON array with the following structure:
{
  "testCases": [
    {
      "name": "test case name",
      "description": "what this test verifies",
      "input": "test input data",
      "expectedOutput": "expected result",
      "category": "positive|negative|edge_case"
    }
  ]
}
`;

    const result = await this.generateJSON<{ testCases: TestCase[] }>(
      prompt, 
      'Array of test case objects'
    );
    
    return result.testCases;
  }
}

interface TestCase {
  name: string;
  description: string;
  input: string;
  expectedOutput: string;
  category: 'positive' | 'negative' | 'edge_case';
}
```

### 3. Multimodal Content Generation

```typescript
import { createUserContent, Part } from '@google/genai';

export class MultimodalGenerator {
  constructor(private adapter: HeadlessGeminiAdapter) {}

  async analyzeImage(imagePath: string, prompt: string): Promise<string> {
    const fs = await import('fs/promises');
    const imageData = await fs.readFile(imagePath);
    
    const parts: Part[] = [
      { text: prompt },
      {
        inlineData: {
          mimeType: this.getMimeType(imagePath),
          data: imageData.toString('base64')
        }
      }
    ];

    const turn = await this.adapter.client.generateContent(parts);
    return turn.response?.text || '';
  }

  async analyzeDocument(documentPath: string, query: string): Promise<string> {
    // Implementation for document analysis
    const fs = await import('fs/promises');
    const documentData = await fs.readFile(documentPath);
    
    const parts: Part[] = [
      { text: `Analyze this document and answer: ${query}` },
      {
        inlineData: {
          mimeType: this.getMimeType(documentPath),
          data: documentData.toString('base64')
        }
      }
    ];

    const turn = await this.adapter.client.generateContent(parts);
    return turn.response?.text || '';
  }

  private getMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'pdf': 'application/pdf',
      'txt': 'text/plain'
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
}
```

## Tool Integration and MCP Support

### 1. Basic Tool Integration

```typescript
import { BaseTool, ToolResult } from '@google/gemini-cli-core';

export class CustomAnalysisTool extends BaseTool {
  name = 'custom_analysis';
  displayName = 'Custom Analysis Tool';
  description = 'Performs custom analysis on provided data';

  parameterSchema = {
    type: 'object',
    properties: {
      data: {
        type: 'string',
        description: 'The data to analyze'
      },
      analysisType: {
        type: 'string',
        enum: ['statistical', 'textual', 'sentiment'],
        description: 'Type of analysis to perform'
      }
    },
    required: ['data', 'analysisType']
  };

  async execute(params: any): Promise<ToolResult> {
    const { data, analysisType } = params;
    
    let result: string;
    switch (analysisType) {
      case 'statistical':
        result = this.performStatisticalAnalysis(data);
        break;
      case 'textual':
        result = this.performTextualAnalysis(data);
        break;
      case 'sentiment':
        result = this.performSentimentAnalysis(data);
        break;
      default:
        throw new Error(`Unknown analysis type: ${analysisType}`);
    }

    return {
      llmContent: `Analysis completed. Result: ${result}`,
      returnDisplay: `## Analysis Result\n\n${result}`
    };
  }

  private performStatisticalAnalysis(data: string): string {
    // Implementation for statistical analysis
    return 'Statistical analysis results...';
  }

  private performTextualAnalysis(data: string): string {
    // Implementation for textual analysis
    return 'Textual analysis results...';
  }

  private performSentimentAnalysis(data: string): string {
    // Implementation for sentiment analysis
    return 'Sentiment analysis results...';
  }
}
```

### 2. MCP Client Integration

```typescript
import { MCPClient, MCPServerConfig } from '@google/gemini-cli-core';

export class MCPIntegratedAdapter extends HeadlessGeminiAdapter {
  private mcpClients: Map<string, MCPClient> = new Map();

  async initializeMCPServers(serverConfigs: MCPServerConfig[]): Promise<void> {
    for (const config of serverConfigs) {
      try {
        const client = new MCPClient();
        await client.connect(config);
        
        // Discover and register tools from the MCP server
        const tools = await client.listTools();
        for (const tool of tools) {
          this.toolRegistry.register(tool);
        }
        
        this.mcpClients.set(config.name, client);
      } catch (error) {
        console.error(`Failed to connect to MCP server ${config.name}:`, error);
      }
    }
  }

  async disconnectMCPServers(): Promise<void> {
    for (const [name, client] of this.mcpClients) {
      try {
        await client.disconnect();
      } catch (error) {
        console.error(`Failed to disconnect from MCP server ${name}:`, error);
      }
    }
    this.mcpClients.clear();
  }
}
```

### 3. OAuth-Enabled MCP Integration

```typescript
import { MCPOAuthProvider, MCPOAuthConfig, MCPOAuthTokenStorage } from '@google/gemini-cli-core';

export class OAuthMCPAdapter {
  private oauthProvider: MCPOAuthProvider;
  private tokenStorage: MCPOAuthTokenStorage;

  constructor(oauthConfig: MCPOAuthConfig) {
    this.tokenStorage = new MCPOAuthTokenStorage();
    this.oauthProvider = new MCPOAuthProvider(oauthConfig, this.tokenStorage);
  }

  async authenticateWithOAuth(serverName: string): Promise<void> {
    try {
      await this.oauthProvider.authenticate(serverName);
      console.log(`Successfully authenticated with ${serverName}`);
    } catch (error) {
      throw new Error(`OAuth authentication failed for ${serverName}: ${error.message}`);
    }
  }

  async getAuthenticatedToken(serverName: string): Promise<string | null> {
    return this.tokenStorage.getAccessToken(serverName);
  }
}
```

## Error Handling and Retry Logic

### 1. Comprehensive Error Handling

```typescript
import { retryWithBackoff } from '@google/gemini-cli-core';

export class RobustGeminiAdapter extends HeadlessGeminiAdapter {
  async generateResponseWithRetry(
    prompt: string,
    options: {
      maxRetries?: number;
      baseDelay?: number;
      maxDelay?: number;
    } = {}
  ): Promise<string> {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 10000
    } = options;

    return retryWithBackoff(
      async () => {
        try {
          return await this.generateResponse(prompt);
        } catch (error) {
          if (this.isRetryableError(error)) {
            throw error; // Retry
          } else {
            throw new Error(`Non-retryable error: ${error.message}`);
          }
        }
      },
      maxRetries,
      baseDelay,
      maxDelay
    );
  }

  private isRetryableError(error: any): boolean {
    // Check for rate limiting
    if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      return true;
    }
    
    // Check for temporary network issues
    if (error.message?.includes('ECONNRESET') || error.message?.includes('timeout')) {
      return true;
    }
    
    // Check for quota exceeded
    if (error.message?.includes('quota exceeded')) {
      return false; // Don't retry quota errors
    }
    
    return false;
  }

  async handleModelFallback(prompt: string): Promise<string> {
    try {
      // Try with the primary model first
      return await this.generateResponse(prompt);
    } catch (error) {
      if (this.isRateLimitError(error)) {
        console.log('Primary model rate limited, falling back to Flash model');
        
        // Switch to flash model temporarily
        const originalModel = this.config.getModel();
        this.config.setModel('gemini-2.5-flash-001');
        
        try {
          const result = await this.generateResponse(prompt);
          // Restore original model
          this.config.setModel(originalModel);
          return result;
        } catch (fallbackError) {
          // Restore original model even on error
          this.config.setModel(originalModel);
          throw fallbackError;
        }
      }
      throw error;
    }
  }

  private isRateLimitError(error: any): boolean {
    return error.message?.includes('429') || 
           error.message?.includes('rate limit') ||
           error.message?.includes('quota exceeded');
  }
}
```

### 2. Advanced Error Recovery

```typescript
export class AdvancedErrorRecovery {
  constructor(private adapter: RobustGeminiAdapter) {}

  async generateWithCircuitBreaker(
    prompt: string,
    circuitBreakerConfig: {
      failureThreshold: number;
      resetTimeout: number;
    } = {
      failureThreshold: 5,
      resetTimeout: 60000
    }
  ): Promise<string> {
    // Simple circuit breaker implementation
    if (this.isCircuitOpen(circuitBreakerConfig)) {
      throw new Error('Circuit breaker is open - too many recent failures');
    }

    try {
      const result = await this.adapter.generateResponseWithRetry(prompt);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private failureCount = 0;
  private lastFailureTime = 0;

  private isCircuitOpen(config: { failureThreshold: number; resetTimeout: number }): boolean {
    if (this.failureCount >= config.failureThreshold) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure < config.resetTimeout) {
        return true;
      } else {
        // Reset the circuit breaker
        this.failureCount = 0;
        return false;
      }
    }
    return false;
  }

  private recordSuccess(): void {
    this.failureCount = 0;
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
  }
}
```

## Advanced Features

### 1. Chat History Compression

```typescript
import { tokenLimit } from '@google/gemini-cli-core';

export class ChatHistoryManager {
  private history: Content[] = [];
  
  constructor(
    private adapter: HeadlessGeminiAdapter,
    private model: string = 'gemini-2.5-pro-001'
  ) {}

  async addMessage(content: Content): Promise<void> {
    this.history.push(content);
    
    // Check if we need to compress history
    if (await this.exceedsTokenLimit()) {
      await this.compressHistory();
    }
  }

  private async exceedsTokenLimit(): Promise<boolean> {
    const limit = tokenLimit(this.model);
    const currentTokens = await this.countTokens(this.history);
    
    // Use 80% of limit as threshold
    return currentTokens > (limit * 0.8);
  }

  private async countTokens(content: Content[]): Promise<number> {
    // Use the adapter's token counting capability
    const response = await this.adapter.client.countTokens({ contents: content });
    return response.totalTokens || 0;
  }

  private async compressHistory(): Promise<void> {
    // Find the point to compress from (keep recent messages)
    const compressionPoint = Math.floor(this.history.length * 0.3);
    const toCompress = this.history.slice(0, compressionPoint);
    const toKeep = this.history.slice(compressionPoint);

    // Generate a compressed summary
    const compressionPrompt = `
Summarize the following conversation history in a concise but comprehensive way:

${JSON.stringify(toCompress, null, 2)}

Provide a summary that captures the key points, decisions, and context.
`;

    const summary = await this.adapter.generateResponse(compressionPrompt);
    
    // Replace the compressed portion with the summary
    const compressedContent: Content = {
      role: 'user',
      parts: [{ text: `[Previous conversation summary: ${summary}]` }]
    };

    this.history = [compressedContent, ...toKeep];
  }

  getHistory(): Content[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }
}
```

### 2. Telemetry and Monitoring

```typescript
import { initializeTelemetry, logApiRequest, logApiResponse } from '@google/gemini-cli-core';

export class MonitoredGeminiAdapter extends HeadlessGeminiAdapter {
  private telemetryEnabled: boolean;

  constructor(options: any, enableTelemetry: boolean = false) {
    super(options);
    this.telemetryEnabled = enableTelemetry;
    
    if (enableTelemetry) {
      this.initializeTelemetry();
    }
  }

  private initializeTelemetry(): void {
    initializeTelemetry({
      enabled: true,
      target: 'console', // or 'file', 'otlp'
      logPrompts: false // Set to true for debugging
    });
  }

  async generateResponse(prompt: string): Promise<string> {
    const startTime = Date.now();
    
    if (this.telemetryEnabled) {
      logApiRequest({
        model: this.config.getModel(),
        promptTokens: prompt.length, // Rough estimate
        timestamp: new Date().toISOString()
      });
    }

    try {
      const result = await super.generateResponse(prompt);
      const duration = Date.now() - startTime;

      if (this.telemetryEnabled) {
        logApiResponse({
          model: this.config.getModel(),
          responseTokens: result.length, // Rough estimate
          duration,
          success: true,
          timestamp: new Date().toISOString()
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      if (this.telemetryEnabled) {
        logApiResponse({
          model: this.config.getModel(),
          duration,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }

      throw error;
    }
  }
}
```

### 3. Proxy and Network Configuration

```typescript
import { ProxyAgent, setGlobalDispatcher } from 'undici';

export class ProxyAwareAdapter extends HeadlessGeminiAdapter {
  constructor(options: any & { proxy?: string }) {
    super(options);
    
    if (options.proxy) {
      this.configureProxy(options.proxy);
    }
  }

  private configureProxy(proxyUrl: string): void {
    const proxyAgent = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(proxyAgent);
    console.log(`Configured proxy: ${proxyUrl}`);
  }
}
```

## Complete Working Examples

### 1. Test Automation Adapter

```typescript
export class TestAutomationAdapter {
  private adapter: MonitoredGeminiAdapter;
  private historyManager: ChatHistoryManager;
  private errorRecovery: AdvancedErrorRecovery;

  constructor(options: {
    apiKey: string;
    model?: string;
    enableTelemetry?: boolean;
    proxy?: string;
  }) {
    this.adapter = new MonitoredGeminiAdapter({
      apiKey: options.apiKey,
      model: options.model || 'gemini-2.5-pro-001',
      authType: AuthType.USE_GEMINI,
      proxy: options.proxy
    }, options.enableTelemetry);

    this.historyManager = new ChatHistoryManager(this.adapter, options.model);
    this.errorRecovery = new AdvancedErrorRecovery(this.adapter);
  }

  async generateTestData(specification: string): Promise<TestData[]> {
    const prompt = `
Generate comprehensive test data for the following specification:

${specification}

Return test data as JSON array with varied but realistic examples.
Include edge cases, boundary values, and typical usage scenarios.
Format: [{"input": "...", "description": "...", "category": "..."}]
`;

    const response = await this.errorRecovery.generateWithCircuitBreaker(prompt);
    
    try {
      return JSON.parse(response) as TestData[];
    } catch (error) {
      throw new Error(`Failed to parse test data: ${error.message}`);
    }
  }

  async validateTestResults(testResults: TestResult[]): Promise<ValidationReport> {
    const prompt = `
Analyze these test results and provide a validation report:

${JSON.stringify(testResults, null, 2)}

Provide analysis in this JSON format:
{
  "overallStatus": "pass|fail|warning",
  "totalTests": number,
  "passed": number,
  "failed": number,
  "warnings": number,
  "summary": "brief summary",
  "recommendations": ["recommendation1", "recommendation2"],
  "riskAreas": ["area1", "area2"]
}
`;

    const response = await this.adapter.generateResponseWithRetry(prompt);
    return JSON.parse(response) as ValidationReport;
  }

  async generateNextTestContext(currentContext: string, testResults: TestResult[]): Promise<string> {
    await this.historyManager.addMessage({
      role: 'user',
      parts: [{ text: `Current context: ${currentContext}` }]
    });

    await this.historyManager.addMessage({
      role: 'user',
      parts: [{ text: `Test results: ${JSON.stringify(testResults)}` }]
    });

    const prompt = `
Based on the current testing context and recent test results, 
generate the next optimal testing context for the following agent.
Consider:
1. Areas that need more coverage
2. Failed tests that need investigation
3. Risk areas identified
4. Logical next steps in the testing process

Provide a comprehensive context that includes:
- What to test next
- Why this area is important
- Expected outcomes
- Key considerations
`;

    const nextContext = await this.adapter.generateResponseWithRetry(prompt);
    
    await this.historyManager.addMessage({
      role: 'model',
      parts: [{ text: nextContext }]
    });

    return nextContext;
  }

  getConversationHistory(): Content[] {
    return this.historyManager.getHistory();
  }

  clearContext(): void {
    this.historyManager.clearHistory();
  }
}

interface TestData {
  input: string;
  description: string;
  category: string;
}

interface TestResult {
  testName: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  errorMessage?: string;
  expected?: any;
  actual?: any;
}

interface ValidationReport {
  overallStatus: 'pass' | 'fail' | 'warning';
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  summary: string;
  recommendations: string[];
  riskAreas: string[];
}
```

### 2. Context Generation for Agent Chains

```typescript
export class AgentContextGenerator {
  private adapter: HeadlessGeminiAdapter;
  private contextHistory: Map<string, ContextEntry[]> = new Map();

  constructor(options: { apiKey: string; model?: string }) {
    this.adapter = new HeadlessGeminiAdapter({
      apiKey: options.apiKey,
      model: options.model || 'gemini-2.5-pro-001',
      authType: AuthType.USE_GEMINI
    });
  }

  async generateContextForAgent(
    agentId: string,
    task: string,
    previousResults?: any[],
    domainKnowledge?: string
  ): Promise<AgentContext> {
    const contextPrompt = this.buildContextPrompt(task, previousResults, domainKnowledge);
    
    const contextResponse = await this.adapter.generateResponseWithRetry(contextPrompt);
    
    const context: AgentContext = {
      agentId,
      task,
      generatedAt: new Date().toISOString(),
      context: contextResponse,
      previousResults: previousResults || [],
      domainKnowledge
    };

    // Store context history
    const history = this.contextHistory.get(agentId) || [];
    history.push({
      timestamp: new Date().toISOString(),
      context,
      task
    });
    this.contextHistory.set(agentId, history);

    return context;
  }

  private buildContextPrompt(task: string, previousResults?: any[], domainKnowledge?: string): string {
    let prompt = `
Generate comprehensive context for an AI agent that will perform the following task:

TASK: ${task}

The context should include:
1. Clear understanding of what needs to be accomplished
2. Key considerations and constraints
3. Expected approach or methodology
4. Success criteria
5. Potential challenges and how to handle them
6. Relevant background information
`;

    if (previousResults && previousResults.length > 0) {
      prompt += `

PREVIOUS RESULTS FROM OTHER AGENTS:
${JSON.stringify(previousResults, null, 2)}

Consider these results when generating context. Build upon successful approaches and learn from any failures.
`;
    }

    if (domainKnowledge) {
      prompt += `

DOMAIN KNOWLEDGE:
${domainKnowledge}

Incorporate this domain-specific knowledge into the context.
`;
    }

    prompt += `

Provide the context in a clear, structured format that an AI agent can easily understand and act upon.
`;

    return prompt;
  }

  async synthesizeMultiAgentContext(
    agentResults: AgentResult[],
    nextTask: string
  ): Promise<SynthesizedContext> {
    const synthesisPrompt = `
Synthesize the following results from multiple AI agents into a comprehensive context for the next task:

AGENT RESULTS:
${JSON.stringify(agentResults, null, 2)}

NEXT TASK: ${nextTask}

Create a synthesized context that:
1. Combines insights from all agents
2. Identifies patterns and correlations
3. Highlights consensus and disagreements
4. Provides recommendations for the next task
5. Flags any gaps or areas needing attention

Format the synthesis in a structured way that clearly organizes the information.
`;

    const synthesis = await this.adapter.generateResponseWithRetry(synthesisPrompt);

    return {
      synthesizedAt: new Date().toISOString(),
      inputResults: agentResults,
      nextTask,
      synthesizedContext: synthesis,
      agentCount: agentResults.length
    };
  }

  getAgentHistory(agentId: string): ContextEntry[] {
    return this.contextHistory.get(agentId) || [];
  }

  clearAgentHistory(agentId: string): void {
    this.contextHistory.delete(agentId);
  }

  async generateExecutionPlan(
    goal: string,
    availableAgents: AgentCapability[],
    constraints?: string[]
  ): Promise<ExecutionPlan> {
    const planPrompt = `
Create an execution plan to achieve the following goal using the available AI agents:

GOAL: ${goal}

AVAILABLE AGENTS:
${JSON.stringify(availableAgents, null, 2)}

${constraints ? `CONSTRAINTS:\n${constraints.join('\n')}` : ''}

Generate a detailed execution plan that includes:
1. Step-by-step breakdown of the task
2. Which agent should handle each step and why
3. Dependencies between steps
4. Expected inputs and outputs for each step
5. Success criteria for each step
6. Fallback strategies if a step fails
7. Estimated timeline

Format as JSON with this structure:
{
  "goal": "string",
  "steps": [
    {
      "stepNumber": number,
      "description": "string",
      "assignedAgent": "string",
      "dependencies": ["step numbers"],
      "inputs": ["required inputs"],
      "expectedOutputs": ["expected outputs"],
      "successCriteria": "string",
      "estimatedDuration": "string",
      "fallbackStrategy": "string"
    }
  ],
  "riskMitigation": ["strategies"],
  "qualityGates": ["checkpoints"]
}
`;

    const planResponse = await this.adapter.generateResponseWithRetry(planPrompt);
    
    try {
      return JSON.parse(planResponse) as ExecutionPlan;
    } catch (error) {
      throw new Error(`Failed to parse execution plan: ${error.message}`);
    }
  }
}

interface AgentContext {
  agentId: string;
  task: string;
  generatedAt: string;
  context: string;
  previousResults: any[];
  domainKnowledge?: string;
}

interface ContextEntry {
  timestamp: string;
  context: AgentContext;
  task: string;
}

interface AgentResult {
  agentId: string;
  task: string;
  result: any;
  success: boolean;
  duration: number;
  errors?: string[];
  metadata?: Record<string, any>;
}

interface SynthesizedContext {
  synthesizedAt: string;
  inputResults: AgentResult[];
  nextTask: string;
  synthesizedContext: string;
  agentCount: number;
}

interface AgentCapability {
  agentId: string;
  capabilities: string[];
  strengths: string[];
  limitations: string[];
  inputTypes: string[];
  outputTypes: string[];
}

interface ExecutionPlan {
  goal: string;
  steps: ExecutionStep[];
  riskMitigation: string[];
  qualityGates: string[];
}

interface ExecutionStep {
  stepNumber: number;
  description: string;
  assignedAgent: string;
  dependencies: number[];
  inputs: string[];
  expectedOutputs: string[];
  successCriteria: string;
  estimatedDuration: string;
  fallbackStrategy: string;
}
```

### 3. Complete Headless Testing Framework

```typescript
export class HeadlessTestingFramework {
  private testAdapter: TestAutomationAdapter;
  private contextGenerator: AgentContextGenerator;
  private mcpAdapter?: MCPIntegratedAdapter;

  constructor(config: {
    apiKey: string;
    model?: string;
    enableTelemetry?: boolean;
    proxy?: string;
    mcpServers?: MCPServerConfig[];
  }) {
    this.testAdapter = new TestAutomationAdapter({
      apiKey: config.apiKey,
      model: config.model,
      enableTelemetry: config.enableTelemetry,
      proxy: config.proxy
    });

    this.contextGenerator = new AgentContextGenerator({
      apiKey: config.apiKey,
      model: config.model
    });

    if (config.mcpServers && config.mcpServers.length > 0) {
      this.mcpAdapter = new MCPIntegratedAdapter({
        apiKey: config.apiKey,
        model: config.model,
        authType: AuthType.USE_GEMINI
      });
      
      // Initialize MCP servers asynchronously
      this.initializeMCPServers(config.mcpServers);
    }
  }

  private async initializeMCPServers(serverConfigs: MCPServerConfig[]): Promise<void> {
    if (this.mcpAdapter) {
      await this.mcpAdapter.initializeMCPServers(serverConfigs);
    }
  }

  async runTestCycle(specification: string): Promise<TestCycleResult> {
    const startTime = Date.now();
    
    try {
      // Generate test data
      const testData = await this.testAdapter.generateTestData(specification);
      
      // Create test context for execution agents
      const testContext = await this.contextGenerator.generateContextForAgent(
        'test-executor',
        `Execute tests based on specification: ${specification}`,
        [{ testData, specification }]
      );

      // Simulate test execution (in real scenario, this would trigger actual test execution)
      const testResults = await this.simulateTestExecution(testData);

      // Validate results
      const validationReport = await this.testAdapter.validateTestResults(testResults);

      // Generate context for next iteration
      const nextContext = await this.testAdapter.generateNextTestContext(
        testContext.context,
        testResults
      );

      return {
        success: true,
        duration: Date.now() - startTime,
        testData,
        testResults,
        validationReport,
        nextContext,
        conversationHistory: this.testAdapter.getConversationHistory()
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        error: error.message,
        testData: [],
        testResults: [],
        nextContext: ''
      };
    }
  }

  private async simulateTestExecution(testData: TestData[]): Promise<TestResult[]> {
    // This would be replaced with actual test execution logic
    return testData.map((data, index) => ({
      testName: `Test_${index + 1}`,
      status: Math.random() > 0.1 ? 'pass' : 'fail', // 90% pass rate
      duration: Math.random() * 1000,
      errorMessage: Math.random() > 0.9 ? 'Simulated test failure' : undefined,
      expected: data.input,
      actual: data.input
    }));
  }

  async generateMultiAgentPlan(
    goal: string,
    availableAgents: AgentCapability[]
  ): Promise<ExecutionPlan> {
    return this.contextGenerator.generateExecutionPlan(goal, availableAgents);
  }

  async cleanup(): Promise<void> {
    this.testAdapter.clearContext();
    
    if (this.mcpAdapter) {
      await this.mcpAdapter.disconnectMCPServers();
    }
  }
}

interface TestCycleResult {
  success: boolean;
  duration: number;
  testData: TestData[];
  testResults: TestResult[];
  validationReport?: ValidationReport;
  nextContext: string;
  error?: string;
  conversationHistory?: Content[];
}
```

## Best Practices for Test Automation

### 1. Configuration Management

```typescript
export class ConfigurationManager {
  private config: TestingConfig;

  constructor(configPath?: string) {
    this.config = this.loadConfiguration(configPath);
  }

  private loadConfiguration(configPath?: string): TestingConfig {
    if (configPath) {
      // Load from file
      const fs = require('fs');
      const rawConfig = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(rawConfig);
    }

    // Load from environment or defaults
    return {
      gemini: {
        apiKey: process.env.GEMINI_API_KEY || '',
        model: process.env.GEMINI_MODEL || 'gemini-2.5-pro-001',
        maxRetries: parseInt(process.env.GEMINI_MAX_RETRIES || '3'),
        timeout: parseInt(process.env.GEMINI_TIMEOUT || '30000')
      },
      testing: {
        enableTelemetry: process.env.ENABLE_TELEMETRY === 'true',
        parallelAgents: parseInt(process.env.PARALLEL_AGENTS || '3'),
        testDataSize: parseInt(process.env.TEST_DATA_SIZE || '10')
      },
      proxy: process.env.HTTP_PROXY || process.env.HTTPS_PROXY,
      mcpServers: this.parseMCPServers()
    };
  }

  private parseMCPServers(): MCPServerConfig[] {
    const mcpConfig = process.env.MCP_SERVERS;
    if (!mcpConfig) return [];

    try {
      return JSON.parse(mcpConfig);
    } catch {
      return [];
    }
  }

  getGeminiConfig(): GeminiConfig {
    return this.config.gemini;
  }

  getTestingConfig(): TestingConfigOptions {
    return this.config.testing;
  }

  getMCPServers(): MCPServerConfig[] {
    return this.config.mcpServers || [];
  }
}

interface TestingConfig {
  gemini: GeminiConfig;
  testing: TestingConfigOptions;
  proxy?: string;
  mcpServers?: MCPServerConfig[];
}

interface GeminiConfig {
  apiKey: string;
  model: string;
  maxRetries: number;
  timeout: number;
}

interface TestingConfigOptions {
  enableTelemetry: boolean;
  parallelAgents: number;
  testDataSize: number;
}
```

### 2. Logging and Monitoring

```typescript
export class TestingLogger {
  private static instance: TestingLogger;
  private logLevel: LogLevel;
  private logFile?: string;

  private constructor(logLevel: LogLevel = LogLevel.INFO, logFile?: string) {
    this.logLevel = logLevel;
    this.logFile = logFile;
  }

  static getInstance(logLevel?: LogLevel, logFile?: string): TestingLogger {
    if (!TestingLogger.instance) {
      TestingLogger.instance = new TestingLogger(logLevel, logFile);
    }
    return TestingLogger.instance;
  }

  log(level: LogLevel, message: string, metadata?: any): void {
    if (level >= this.logLevel) {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level: LogLevel[level],
        message,
        metadata
      };

      const formattedLog = JSON.stringify(logEntry);
      console.log(formattedLog);

      if (this.logFile) {
        const fs = require('fs');
        fs.appendFileSync(this.logFile, formattedLog + '\n');
      }
    }
  }

  error(message: string, error?: Error): void {
    this.log(LogLevel.ERROR, message, { error: error?.message, stack: error?.stack });
  }

  warn(message: string, metadata?: any): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  info(message: string, metadata?: any): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  debug(message: string, metadata?: any): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }
}

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}
```

### 3. Performance Monitoring

```typescript
export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map();

  startTimer(operation: string): PerformanceTimer {
    return new PerformanceTimer(operation, this);
  }

  recordMetric(operation: string, duration: number, success: boolean, metadata?: any): void {
    const metric: PerformanceMetric = {
      operation,
      duration,
      success,
      timestamp: Date.now(),
      metadata
    };

    const existing = this.metrics.get(operation) || [];
    existing.push(metric);
    this.metrics.set(operation, existing);
  }

  getMetrics(operation?: string): PerformanceMetric[] {
    if (operation) {
      return this.metrics.get(operation) || [];
    }

    const allMetrics: PerformanceMetric[] = [];
    for (const metrics of this.metrics.values()) {
      allMetrics.push(...metrics);
    }
    return allMetrics;
  }

  getAverageResponseTime(operation: string): number {
    const metrics = this.metrics.get(operation) || [];
    if (metrics.length === 0) return 0;

    const totalDuration = metrics.reduce((sum, metric) => sum + metric.duration, 0);
    return totalDuration / metrics.length;
  }

  getSuccessRate(operation: string): number {
    const metrics = this.metrics.get(operation) || [];
    if (metrics.length === 0) return 0;

    const successCount = metrics.filter(metric => metric.success).length;
    return successCount / metrics.length;
  }

  generateReport(): PerformanceReport {
    const operations = Array.from(this.metrics.keys());
    const operationStats = operations.map(operation => ({
      operation,
      totalCalls: this.metrics.get(operation)?.length || 0,
      averageResponseTime: this.getAverageResponseTime(operation),
      successRate: this.getSuccessRate(operation)
    }));

    return {
      generatedAt: new Date().toISOString(),
      totalOperations: operations.length,
      operationStats
    };
  }
}

class PerformanceTimer {
  private startTime: number;

  constructor(
    private operation: string,
    private monitor: PerformanceMonitor
  ) {
    this.startTime = Date.now();
  }

  end(success: boolean = true, metadata?: any): void {
    const duration = Date.now() - this.startTime;
    this.monitor.recordMetric(this.operation, duration, success, metadata);
  }
}

interface PerformanceMetric {
  operation: string;
  duration: number;
  success: boolean;
  timestamp: number;
  metadata?: any;
}

interface PerformanceReport {
  generatedAt: string;
  totalOperations: number;
  operationStats: {
    operation: string;
    totalCalls: number;
    averageResponseTime: number;
    successRate: number;
  }[];
}
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Authentication Problems

```typescript
export class AuthenticationTroubleshooter {
  static async diagnoseAuthIssues(config: ContentGeneratorConfig): Promise<DiagnosticReport> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check API key format
    if (config.authType === AuthType.USE_GEMINI) {
      if (!config.apiKey) {
        issues.push('GEMINI_API_KEY is not set');
        recommendations.push('Set GEMINI_API_KEY environment variable or pass apiKey in config');
      } else if (!config.apiKey.startsWith('AI')) {
        issues.push('API key format appears invalid for Gemini API');
        recommendations.push('Verify API key from Google AI Studio');
      }
    }

    // Check Vertex AI configuration
    if (config.authType === AuthType.USE_VERTEX_AI) {
      if (!config.apiKey) {
        issues.push('GOOGLE_API_KEY is not set for Vertex AI');
        recommendations.push('Set GOOGLE_API_KEY environment variable');
      }
      if (!process.env.GOOGLE_GENAI_USE_VERTEXAI) {
        issues.push('GOOGLE_GENAI_USE_VERTEXAI not set to true');
        recommendations.push('Set GOOGLE_GENAI_USE_VERTEXAI=true environment variable');
      }
    }

    // Test authentication
    try {
      const testGenerator = createContentGenerator(config);
      await testGenerator.countTokens({ contents: [{ role: 'user', parts: [{ text: 'test' }] }] });
      recommendations.push('Authentication test passed');
    } catch (error) {
      issues.push(`Authentication test failed: ${error.message}`);
      recommendations.push('Check network connectivity and API key validity');
    }

    return {
      hasIssues: issues.length > 0,
      issues,
      recommendations
    };
  }
}
```

#### 2. Rate Limiting and Quota Issues

```typescript
export class RateLimitHandler {
  static isRateLimited(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    return message.includes('429') || 
           message.includes('rate limit') || 
           message.includes('quota exceeded') ||
           message.includes('too many requests');
  }

  static getRetryDelay(error: any, attempt: number): number {
    // Check for Retry-After header information
    if (error.response?.headers?.['retry-after']) {
      return parseInt(error.response.headers['retry-after']) * 1000;
    }

    // Exponential backoff with jitter
    const baseDelay = 1000; // 1 second
    const maxDelay = 60000; // 1 minute
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    const jitter = Math.random() * 0.1 * delay; // 10% jitter
    
    return delay + jitter;
  }

  static async handleRateLimit(error: any, attempt: number): Promise<void> {
    if (this.isRateLimited(error)) {
      const delay = this.getRetryDelay(error, attempt);
      console.warn(`Rate limited. Waiting ${delay}ms before retry (attempt ${attempt})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    } else {
      throw error; // Re-throw if not a rate limit error
    }
  }
}
```

#### 3. Model and Token Limit Issues

```typescript
export class ModelTroubleshooter {
  static async validateModel(model: string, contentGenerator: ContentGenerator): Promise<boolean> {
    try {
      // Test with a simple request
      await contentGenerator.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        generationConfig: { maxOutputTokens: 10 }
      });
      return true;
    } catch (error) {
      console.error(`Model validation failed for ${model}:`, error.message);
      return false;
    }
  }

  static async checkTokenLimits(
    content: Content[],
    model: string,
    contentGenerator: ContentGenerator
  ): Promise<TokenLimitCheck> {
    try {
      const tokenCount = await contentGenerator.countTokens({ contents: content });
      const limit = tokenLimit(model);
      
      return {
        currentTokens: tokenCount.totalTokens || 0,
        tokenLimit: limit,
        withinLimit: (tokenCount.totalTokens || 0) < limit * 0.9, // 90% threshold
        utilizationPercentage: ((tokenCount.totalTokens || 0) / limit) * 100
      };
    } catch (error) {
      return {
        currentTokens: 0,
        tokenLimit: 0,
        withinLimit: false,
        utilizationPercentage: 0,
        error: error.message
      };
    }
  }
}

interface TokenLimitCheck {
  currentTokens: number;
  tokenLimit: number;
  withinLimit: boolean;
  utilizationPercentage: number;
  error?: string;
}

interface DiagnosticReport {
  hasIssues: boolean;
  issues: string[];
  recommendations: string[];
}
```

#### 4. Network and Connectivity Issues

```typescript
export class NetworkTroubleshooter {
  static async testConnectivity(proxy?: string): Promise<ConnectivityReport> {
    const tests: ConnectivityTest[] = [];

    // Test basic internet connectivity
    tests.push(await this.testEndpoint('https://www.google.com', 'Basic Internet'));

    // Test Google AI API endpoint
    tests.push(await this.testEndpoint('https://generativelanguage.googleapis.com', 'Google AI API'));

    // Test Vertex AI endpoint
    tests.push(await this.testEndpoint('https://us-central1-aiplatform.googleapis.com', 'Vertex AI'));

    // Test with proxy if configured
    if (proxy) {
      tests.push(await this.testEndpointWithProxy('https://www.google.com', proxy, 'Proxy Test'));
    }

    const allPassed = tests.every(test => test.success);
    const recommendations = this.generateNetworkRecommendations(tests, proxy);

    return {
      allTestsPassed: allPassed,
      tests,
      recommendations
    };
  }

  private static async testEndpoint(url: string, description: string): Promise<ConnectivityTest> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      return {
        description,
        url,
        success: response.ok,
        responseTime: Date.now() - startTime,
        statusCode: response.status
      };
    } catch (error) {
      return {
        description,
        url,
        success: false,
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  private static async testEndpointWithProxy(
    url: string,
    proxy: string,
    description: string
  ): Promise<ConnectivityTest> {
    // Implementation would depend on proxy configuration
    // This is a simplified version
    return {
      description,
      url,
      success: true, // Placeholder
      responseTime: 0
    };
  }

  private static generateNetworkRecommendations(
    tests: ConnectivityTest[],
    proxy?: string
  ): string[] {
    const recommendations: string[] = [];

    const failedTests = tests.filter(test => !test.success);
    
    if (failedTests.length === 0) {
      recommendations.push('All connectivity tests passed');
      return recommendations;
    }

    if (failedTests.some(test => test.description.includes('Basic Internet'))) {
      recommendations.push('Check internet connection');
      recommendations.push('Verify DNS settings');
    }

    if (failedTests.some(test => test.description.includes('Google AI API'))) {
      recommendations.push('Check if Google AI API is accessible from your network');
      recommendations.push('Verify firewall settings allow HTTPS traffic to googleapis.com');
    }

    if (failedTests.some(test => test.description.includes('Vertex AI'))) {
      recommendations.push('Check if Vertex AI endpoints are accessible');
      recommendations.push('Verify Google Cloud project settings');
    }

    if (proxy && failedTests.some(test => test.description.includes('Proxy'))) {
      recommendations.push('Verify proxy configuration');
      recommendations.push('Check proxy authentication if required');
    }

    const slowTests = tests.filter(test => test.responseTime > 5000);
    if (slowTests.length > 0) {
      recommendations.push('Network latency is high - consider optimizing connection');
    }

    return recommendations;
  }
}

interface ConnectivityTest {
  description: string;
  url: string;
  success: boolean;
  responseTime: number;
  statusCode?: number;
  error?: string;
}

interface ConnectivityReport {
  allTestsPassed: boolean;
  tests: ConnectivityTest[];
  recommendations: string[];
}
```

### Complete Diagnostic Runner

```typescript
export class CompleteDiagnostics {
  static async runFullDiagnostics(config: ContentGeneratorConfig): Promise<FullDiagnosticReport> {
    console.log('Running comprehensive diagnostics...');

    const authDiagnostics = await AuthenticationTroubleshooter.diagnoseAuthIssues(config);
    const networkDiagnostics = await NetworkTroubleshooter.testConnectivity(config.proxy);

    let modelValidation: boolean = false;
    let tokenLimitCheck: TokenLimitCheck | undefined;

    try {
      const contentGenerator = createContentGenerator(config);
      modelValidation = await ModelTroubleshooter.validateModel(config.model, contentGenerator);
      
      if (modelValidation) {
        tokenLimitCheck = await ModelTroubleshooter.checkTokenLimits(
          [{ role: 'user', parts: [{ text: 'test message' }] }],
          config.model,
          contentGenerator
        );
      }
    } catch (error) {
      console.error('Failed to create content generator for diagnostics:', error.message);
    }

    const overallStatus = !authDiagnostics.hasIssues && 
                         networkDiagnostics.allTestsPassed && 
                         modelValidation;

    const allRecommendations = [
      ...authDiagnostics.recommendations,
      ...networkDiagnostics.recommendations
    ];

    if (tokenLimitCheck && !tokenLimitCheck.withinLimit) {
      allRecommendations.push('Consider compressing conversation history or using a model with higher token limits');
    }

    return {
      timestamp: new Date().toISOString(),
      overallStatus,
      authentication: authDiagnostics,
      network: networkDiagnostics,
      modelValidation,
      tokenLimitCheck,
      recommendations: allRecommendations
    };
  }
}

interface FullDiagnosticReport {
  timestamp: string;
  overallStatus: boolean;
  authentication: DiagnosticReport;
  network: ConnectivityReport;
  modelValidation: boolean;
  tokenLimitCheck?: TokenLimitCheck;
  recommendations: string[];
}
```

## Usage Examples

### Quick Start Example

```typescript
// Quick start example for test automation
async function quickStart() {
  const framework = new HeadlessTestingFramework({
    apiKey: process.env.GEMINI_API_KEY!,
    model: 'gemini-2.5-pro-001',
    enableTelemetry: true
  });

  try {
    const result = await framework.runTestCycle(`
      API endpoint: POST /users
      Purpose: Create new user account
      Required fields: email, password, firstName, lastName
      Validation: email format, password strength, unique email
    `);

    console.log('Test cycle completed:', result.success);
    console.log('Validation report:', result.validationReport);
    console.log('Next context for agents:', result.nextContext);

  } finally {
    await framework.cleanup();
  }
}
```

### Agent Chain Example

```typescript
// Example of feeding context between agents
async function agentChainExample() {
  const contextGenerator = new AgentContextGenerator({
    apiKey: process.env.GEMINI_API_KEY!
  });

  // Generate context for first agent
  const analysisContext = await contextGenerator.generateContextForAgent(
    'analysis-agent',
    'Analyze user feedback data for sentiment and themes',
    undefined,
    'Customer feedback analysis domain knowledge...'
  );

  // Simulate first agent completing its task
  const analysisResult: AgentResult = {
    agentId: 'analysis-agent',
    task: 'sentiment analysis',
    result: { sentiment: 'positive', themes: ['performance', 'usability'] },
    success: true,
    duration: 5000
  };

  // Generate context for second agent based on first agent's results
  const reportContext = await contextGenerator.generateContextForAgent(
    'report-agent',
    'Generate executive summary report',
    [analysisResult]
  );

  console.log('Context for report agent:', reportContext.context);
}
```

This comprehensive guide provides a solid foundation for building sophisticated JavaScript adapters for Gemini. The patterns demonstrated here are based on the actual implementation in the Gemini CLI codebase and can be adapted for various use cases including test automation, agent coordination, and complex content generation workflows.