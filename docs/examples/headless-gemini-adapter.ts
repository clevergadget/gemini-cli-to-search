/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Complete working example of a headless Gemini adapter for test automation
 * This example demonstrates all the key patterns from the guide
 */

import {
  Config,
  GeminiClient,
  ToolRegistry,
  createContentGenerator,
  AuthType,
  ContentGeneratorConfig,
  retryWithBackoff,
  tokenLimit,
  ReadFileTool,
  WriteFileTool,
  LSTool,
  GrepTool,
  GlobTool,
  ShellTool,
  WebFetchTool,
  WebSearchTool,
  Content
} from '@google/gemini-cli-core';

/**
 * Main headless adapter class following the patterns from the guide
 */
export class HeadlessGeminiAdapter {
  private client: GeminiClient;
  private config: Config;
  private toolRegistry: ToolRegistry;

  constructor(options: {
    apiKey?: string;
    model?: string;
    authType?: AuthType;
    workingDirectory?: string;
    proxy?: string;
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
      authType: options.authType || AuthType.USE_GEMINI,
      proxy: options.proxy
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

  private isRetryableError(error: Error): boolean {
    const message = error.message?.toLowerCase() || '';
    return message.includes('429') || 
           message.includes('rate limit') ||
           message.includes('econnreset') ||
           message.includes('timeout');
  }

  async generateJSON<T>(prompt: string, schema: string): Promise<T> {
    const structuredPrompt = `
${prompt}

Please respond with valid JSON that matches this schema:
${schema}

Response (JSON only):
`;

    const response = await this.generateResponseWithRetry(structuredPrompt);
    
    try {
      return JSON.parse(response) as T;
    } catch (error: unknown) {
      throw new Error(`Failed to parse JSON response: ${(error as Error).message}`);
    }
  }

  async *generateStreamingResponse(prompt: string): AsyncGenerator<string> {
    const stream = this.client.generateContentStream([{ text: prompt }]);
    
    for await (const event of stream) {
      if (event.type === 'content' && event.content?.text) {
        yield event.content.text;
      }
    }
  }

  // Expose internal components for advanced usage
  get internalClient(): GeminiClient {
    return this.client;
  }

  get internalConfig(): Config {
    return this.config;
  }

  get internalToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }
}

/**
 * Test automation specific adapter
 */
export class TestAutomationAdapter {
  private adapter: HeadlessGeminiAdapter;
  private historyManager: ChatHistoryManager;

  constructor(options: {
    apiKey: string;
    model?: string;
    enableTelemetry?: boolean;
    proxy?: string;
  }) {
    this.adapter = new HeadlessGeminiAdapter({
      apiKey: options.apiKey,
      model: options.model || 'gemini-2.5-pro-001',
      authType: AuthType.USE_GEMINI,
      proxy: options.proxy
    });

    this.historyManager = new ChatHistoryManager(this.adapter, options.model);
  }

  async generateTestData(specification: string): Promise<TestCase[]> {
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

    const result = await this.adapter.generateJSON<{ testCases: TestCase[] }>(
      prompt, 
      'Array of test case objects'
    );
    
    return result.testCases;
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

/**
 * Chat history management with compression
 */
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
    try {
      // Use the adapter's token counting capability
      const response = await this.adapter.internalClient.countTokens({ contents: content });
      return response.totalTokens || 0;
    } catch {
      // Fallback to rough estimation
      const totalText = content.map(c => 
        c.parts?.map(p => p.text || '').join('') || ''
      ).join('');
      return Math.ceil(totalText.length / 4); // Rough approximation
    }
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

/**
 * Agent context generator for feeding context to other agents
 */
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
    previousResults?: unknown[],
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

  private buildContextPrompt(task: string, previousResults?: unknown[], domainKnowledge?: string): string {
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

  getAgentHistory(agentId: string): ContextEntry[] {
    return this.contextHistory.get(agentId) || [];
  }

  clearAgentHistory(agentId: string): void {
    this.contextHistory.delete(agentId);
  }
}

/**
 * Complete testing framework combining all components
 */
export class HeadlessTestingFramework {
  private testAdapter: TestAutomationAdapter;
  private contextGenerator: AgentContextGenerator;

  constructor(config: {
    apiKey: string;
    model?: string;
    enableTelemetry?: boolean;
    proxy?: string;
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

  private async simulateTestExecution(testData: TestCase[]): Promise<TestResult[]> {
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

  async cleanup(): Promise<void> {
    this.testAdapter.clearContext();
  }
}

// Type definitions
export interface TestCase {
  name: string;
  description: string;
  input: string;
  expectedOutput: string;
  category: 'positive' | 'negative' | 'edge_case';
}

export interface TestResult {
  testName: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  errorMessage?: string;
  expected?: unknown;
  actual?: unknown;
}

export interface ValidationReport {
  overallStatus: 'pass' | 'fail' | 'warning';
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  summary: string;
  recommendations: string[];
  riskAreas: string[];
}

export interface AgentContext {
  agentId: string;
  task: string;
  generatedAt: string;
  context: string;
  previousResults: unknown[];
  domainKnowledge?: string;
}

export interface ContextEntry {
  timestamp: string;
  context: AgentContext;
  task: string;
}

export interface TestCycleResult {
  success: boolean;
  duration: number;
  testData: TestCase[];
  testResults: TestResult[];
  validationReport?: ValidationReport;
  nextContext: string;
  error?: string;
  conversationHistory?: Content[];
}

// Usage example
export async function exampleUsage() {
  // Basic usage
  const adapter = new HeadlessGeminiAdapter({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.5-pro-001'
  });

  const response = await adapter.generateResponse("Generate 3 test cases for a login API");
  console.log('Response:', response);

  // Test automation usage
  const framework = new HeadlessTestingFramework({
    apiKey: process.env.GEMINI_API_KEY!,
    model: 'gemini-2.5-pro-001',
    enableTelemetry: true
  });

  const result = await framework.runTestCycle(`
    API endpoint: POST /users
    Purpose: Create new user account
    Required fields: email, password, firstName, lastName
    Validation: email format, password strength, unique email
  `);

  console.log('Test cycle completed:', result.success);
  console.log('Next context:', result.nextContext);

  await framework.cleanup();
}

// Export everything for easy importing
export * from '@google/gemini-cli-core';