# Gemini CLI Error Handling Guide

A comprehensive guide for developers to intelligently handle all error scenarios that may be issued by the Gemini CLI and API.

## Table of Contents
1. [Authentication Errors](#authentication-errors)
2. [API Rate Limiting Errors](#api-rate-limiting-errors)
3. [Network and Connection Errors](#network-and-connection-errors)
4. [API Response Errors](#api-response-errors)
5. [Model and Content Errors](#model-and-content-errors)
6. [Tool Execution Errors](#tool-execution-errors)
7. [Configuration and Startup Errors](#configuration-and-startup-errors)
8. [Chat and Session Management Errors](#chat-and-session-management-errors)
9. [Telemetry and Logging Errors](#telemetry-and-logging-errors)
10. [Error Detection Patterns](#error-detection-patterns)
11. [Retry and Fallback Strategies](#retry-and-fallback-strategies)
12. [User Messaging Guidelines](#user-messaging-guidelines)

---

## Authentication Errors

### 1. Unauthorized Access (401)

**Detection:**
```typescript
// Status code check
error.status === 401

// Message patterns
error.message.includes('401') || error.message.includes('Unauthorized')

// Using utility functions
import { UnauthorizedError } from '@google/gemini-cli-core';
error instanceof UnauthorizedError
```

**Common Scenarios:**
- Invalid or expired API key
- OAuth token expiration
- Missing authentication credentials
- Revoked access tokens

**Handling Strategy:**
```typescript
if (error instanceof UnauthorizedError || error.status === 401) {
  // Clear cached credentials
  await clearCachedCredentialFile();
  
  // Prompt for re-authentication
  console.error('Authentication failed. Please run /auth to re-authenticate.');
  
  // In non-interactive mode, exit with helpful message
  if (isNonInteractiveMode) {
    console.error('Please set GEMINI_API_KEY or run authentication setup.');
    process.exit(1);
  }
}
```

### 2. Forbidden Access (403)

**Detection:**
```typescript
// Status code check
error.status === 403

// Using utility functions
import { ForbiddenError } from '@google/gemini-cli-core';
error instanceof ForbiddenError
```

**Common Scenarios:**
- Cloud project doesn't have Gemini Code Assist enabled
- Insufficient permissions for requested operation
- Region/location restrictions
- Account limitations

**Handling Strategy:**
```typescript
if (error instanceof ForbiddenError || error.status === 403) {
  // Check for specific Code Assist messaging
  if (error.message.includes('code assist') || error.message.includes('Code Assist')) {
    console.error(
      'Your Google Cloud project doesn\'t have Gemini Code Assist enabled. ' +
      'Please visit https://goo.gle/set-up-gemini-code-assist to set up access.'
    );
  } else {
    console.error('Access forbidden: ' + error.message);
    console.error('Please check your project permissions and API access.');
  }
}
```

### 3. OAuth Flow Failures

**Detection:**
```typescript
// OAuth-specific error patterns
error.message.includes('Error during authentication')
error.message.includes('State mismatch')
error.message.includes('No code found in request')
error.message.includes('CSRF attack')
```

**Common Scenarios:**
- Browser redirect failures
- State parameter mismatch
- Authorization code not received
- CSRF attack detection

**Handling Strategy:**
```typescript
// Retry with different auth method
if (authError.includes('browser') || authError.includes('redirect')) {
  console.error('Browser authentication failed. Trying user code method...');
  
  // Fallback to user code flow
  const success = await authWithUserCode(client);
  if (!success) {
    console.error('Please try running with NO_BROWSER=true environment variable.');
  }
}
```

---

## API Rate Limiting Errors

### 1. Pro Model Quota Exceeded (429)

**Detection:**
```typescript
import { isProQuotaExceededError } from '@google/gemini-cli-core';

// Specific Pro quota detection
if (error.status === 429 && isProQuotaExceededError(error)) {
  // Handle Pro-specific quota exceeded
}

// Message pattern matching
error.message.includes("Quota exceeded for quota metric 'Gemini") &&
error.message.includes("Pro Requests'")
```

**Handling Strategy:**
```typescript
if (isProQuotaExceededError(error) && authType === AuthType.LOGIN_WITH_GOOGLE) {
  const currentModel = config.getModel();
  const fallbackModel = DEFAULT_GEMINI_FLASH_MODEL;
  
  // Different messaging based on user tier
  if (userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD) {
    // Paid tier messaging
    console.warn(
      `You have reached your daily ${currentModel} quota limit. ` +
      `Switching to ${fallbackModel} model for this session. ` +
      `Consider using a paid API key from AI Studio for continued ${currentModel} access.`
    );
  } else {
    // Free tier messaging
    console.warn(
      `You have reached your daily ${currentModel} quota limit. ` +
      `Switching to ${fallbackModel} model. ` +
      `Upgrade to Gemini Code Assist Standard/Enterprise for higher limits.`
    );
  }
  
  // Switch model and retry
  config.setModel(fallbackModel);
  return await retryOperation();
}
```

### 2. Generic Quota Exceeded (429)

**Detection:**
```typescript
import { isGenericQuotaExceededError } from '@google/gemini-cli-core';

if (error.status === 429 && isGenericQuotaExceededError(error)) {
  // Handle generic quota limits
}
```

**Handling Strategy:**
```typescript
if (isGenericQuotaExceededError(error)) {
  switch (authType) {
    case AuthType.LOGIN_WITH_GOOGLE:
      console.error(
        'Daily quota limit reached. ' +
        'Upgrade to Gemini Code Assist Standard/Enterprise or ' +
        'use /auth to switch to a paid API key.'
      );
      break;
      
    case AuthType.USE_GEMINI:
      console.error(
        'API quota exceeded. ' +
        'Request quota increase through AI Studio or wait and try again.'
      );
      break;
      
    case AuthType.USE_VERTEX_AI:
      console.error(
        'Vertex AI quota exceeded. ' +
        'Request quota increase through Google Cloud Console.'
      );
      break;
  }
}
```

### 3. Rate Limiting with Retry-After

**Detection:**
```typescript
// Check for Retry-After header in error response
function getRetryAfterDelay(error: unknown): number {
  if (error?.response?.headers?.['retry-after']) {
    const retryAfter = error.response.headers['retry-after'];
    const seconds = parseInt(retryAfter, 10);
    return !isNaN(seconds) ? seconds * 1000 : 0;
  }
  return 0;
}
```

**Handling Strategy:**
```typescript
if (error.status === 429) {
  const retryAfterMs = getRetryAfterDelay(error);
  
  if (retryAfterMs > 0) {
    console.warn(`Rate limited. Retrying after ${retryAfterMs/1000} seconds...`);
    await delay(retryAfterMs);
    return await retryOperation();
  } else {
    // Exponential backoff
    const backoffDelay = Math.min(30000, Math.pow(2, attemptNumber) * 1000);
    await delay(backoffDelay);
    return await retryOperation();
  }
}
```

---

## Network and Connection Errors

### 1. Timeout Errors

**Detection:**
```typescript
import { isNodeError, FetchError } from '@google/gemini-cli-core';

// Timeout detection patterns
if (isNodeError(error) && error.code === 'ETIMEDOUT') {
  // Network timeout
}

if (error instanceof FetchError && error.code === 'ETIMEDOUT') {
  // Fetch timeout
}

// AbortSignal timeout
if (error.name === 'AbortError' || error.message.includes('aborted')) {
  // Request was aborted
}
```

**Handling Strategy:**
```typescript
if (isTimeoutError(error)) {
  // Increase timeout for retry
  const newTimeout = Math.min(60000, currentTimeout * 2);
  
  console.warn(`Request timed out. Retrying with ${newTimeout/1000}s timeout...`);
  
  return await retryWithTimeout(operation, newTimeout);
}
```

### 2. Connection Errors

**Detection:**
```typescript
// Common connection error patterns
const isConnectionError = (error: Error) => {
  const message = error.message.toLowerCase();
  return (
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('network') ||
    message.includes('connection') ||
    message.includes('dns')
  );
};
```

**Handling Strategy:**
```typescript
if (isConnectionError(error)) {
  console.error('Network connection failed. Please check:');
  console.error('1. Internet connectivity');
  console.error('2. Proxy settings (if applicable)');
  console.error('3. Firewall restrictions');
  
  // Check proxy configuration
  if (config.getProxy()) {
    console.error(`Current proxy: ${config.getProxy()}`);
  }
  
  // Suggest retry after delay
  console.error('Retrying in 5 seconds...');
  await delay(5000);
  return await retryOperation();
}
```

### 3. Proxy Configuration Issues

**Detection:**
```typescript
// Proxy-related error detection
const isProxyError = (error: Error) => {
  const message = error.message.toLowerCase();
  return (
    message.includes('proxy') ||
    message.includes('tunnel') ||
    message.includes('407') // Proxy Authentication Required
  );
};
```

**Handling Strategy:**
```typescript
if (isProxyError(error)) {
  console.error('Proxy configuration issue detected.');
  
  if (error.message.includes('407')) {
    console.error('Proxy authentication required. Please check your proxy credentials.');
  }
  
  console.error('Current proxy settings:');
  console.error(`HTTP_PROXY: ${process.env.HTTP_PROXY || 'not set'}`);
  console.error(`HTTPS_PROXY: ${process.env.HTTPS_PROXY || 'not set'}`);
  
  console.error('Try updating proxy settings or contacting your network administrator.');
}
```

---

## API Response Errors

### 1. Bad Request (400)

**Detection:**
```typescript
import { BadRequestError } from '@google/gemini-cli-core';

if (error instanceof BadRequestError || error.status === 400) {
  // Handle malformed request
}
```

**Handling Strategy:**
```typescript
if (error.status === 400) {
  console.error('Invalid request sent to API:');
  console.error(`Error: ${error.message}`);
  
  // Check for specific validation errors
  if (error.message.includes('model')) {
    console.error('Model specification may be invalid. Check supported models.');
  }
  
  if (error.message.includes('token')) {
    console.error('Request may exceed token limits. Try reducing input size.');
  }
  
  // Don't retry 400 errors as they indicate client-side issues
  throw error;
}
```

### 2. Server Errors (5xx)

**Detection:**
```typescript
const isServerError = (error: unknown) => {
  const status = error?.status || extractStatusFromMessage(error?.message);
  return status >= 500 && status < 600;
};
```

**Handling Strategy:**
```typescript
if (isServerError(error)) {
  console.warn(`Server error (${error.status}). This is likely temporary.`);
  
  // Retry with exponential backoff
  const maxRetries = 5;
  const baseDelay = 1000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const delay = baseDelay * Math.pow(2, attempt - 1);
    console.warn(`Retrying in ${delay/1000} seconds... (attempt ${attempt}/${maxRetries})`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      return await retryOperation();
    } catch (retryError) {
      if (attempt === maxRetries) {
        throw retryError;
      }
    }
  }
}
```

### 3. Empty Response Handling

**Detection:**
```typescript
// Empty response detection
const isEmptyResponse = (response: any) => {
  return (
    !response ||
    !response.candidates ||
    response.candidates.length === 0 ||
    !response.candidates[0]?.content ||
    !response.candidates[0]?.content.parts ||
    response.candidates[0]?.content.parts.length === 0
  );
};
```

**Handling Strategy:**
```typescript
if (isEmptyResponse(response)) {
  console.warn('Received empty response from API. This may indicate:');
  console.warn('1. Content was filtered for safety');
  console.warn('2. Request was too complex');
  console.warn('3. Temporary API issue');
  
  // Report for analysis
  await reportError(
    new Error('API returned empty response'),
    'Empty response received',
    { originalRequest: request },
    'empty-response'
  );
  
  throw new Error('API returned an empty response. Please try rephrasing your request.');
}
```

### 4. JSON Parsing Failures

**Detection:**
```typescript
// JSON parse error detection
const isJSONParseError = (error: Error) => {
  return (
    error instanceof SyntaxError ||
    error.message.includes('JSON') ||
    error.message.includes('parse') ||
    error.message.includes('Unexpected token')
  );
};
```

**Handling Strategy:**
```typescript
if (isJSONParseError(error)) {
  console.error('Failed to parse API response as JSON.');
  
  // Log the problematic response for debugging
  await reportError(
    error,
    'JSON parsing failed',
    { 
      responseText: responseText?.substring(0, 1000), // Truncate for logging
      parseError: error.message 
    },
    'json-parse-error'
  );
  
  throw new Error('Invalid response format from API. Please try again.');
}
```

---

## Model and Content Errors

### 1. Finish Reason Handling

The Gemini API uses finish reasons to indicate why content generation stopped. Each finish reason requires specific handling:

**Detection:**
```typescript
import { FinishReason } from '@google/genai';

// Complete finish reason detection and handling
function handleFinishReason(finishReason: FinishReason): string | null {
  const finishReasonMessages: Record<FinishReason, string | undefined> = {
    [FinishReason.FINISH_REASON_UNSPECIFIED]: undefined,
    [FinishReason.STOP]: undefined, // Normal completion
    [FinishReason.MAX_TOKENS]: 'Response truncated due to token limits.',
    [FinishReason.SAFETY]: 'Response stopped due to safety reasons.',
    [FinishReason.RECITATION]: 'Response stopped due to recitation policy.',
    [FinishReason.LANGUAGE]: 'Response stopped due to unsupported language.',
    [FinishReason.BLOCKLIST]: 'Response stopped due to forbidden terms.',
    [FinishReason.PROHIBITED_CONTENT]: 'Response stopped due to prohibited content.',
    [FinishReason.SPII]: 'Response stopped due to sensitive personally identifiable information.',
    [FinishReason.OTHER]: 'Response stopped for other reasons.',
    [FinishReason.MALFORMED_FUNCTION_CALL]: 'Response stopped due to malformed function call.',
    [FinishReason.IMAGE_SAFETY]: 'Response stopped due to image safety violations.',
    [FinishReason.UNEXPECTED_TOOL_CALL]: 'Response stopped due to unexpected tool call.',
  };

  return finishReasonMessages[finishReason] || undefined;
}
```

**Comprehensive Handling Strategy:**
```typescript
function handleContentGenerationResponse(response: GenerateContentResponse) {
  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason;
  
  if (!finishReason || finishReason === FinishReason.STOP || finishReason === FinishReason.FINISH_REASON_UNSPECIFIED) {
    // Normal completion - continue processing
    return;
  }
  
  const errorMessage = handleFinishReason(finishReason);
  if (errorMessage) {
    switch (finishReason) {
      case FinishReason.MAX_TOKENS:
        console.warn(errorMessage);
        console.warn('Try:');
        console.warn('1. Reducing input size');
        console.warn('2. Breaking into smaller requests');
        console.warn('3. Using /compress for chat history');
        break;
        
      case FinishReason.SAFETY:
      case FinishReason.PROHIBITED_CONTENT:
      case FinishReason.BLOCKLIST:
        console.warn(errorMessage);
        console.warn('Please:');
        console.warn('1. Rephrase your request');
        console.warn('2. Remove potentially sensitive content');
        console.warn('3. Use more specific, professional language');
        break;
        
      case FinishReason.RECITATION:
        console.warn(errorMessage);
        console.warn('The model detected potential copyrighted content.');
        console.warn('Please make your request more original and specific.');
        break;
        
      case FinishReason.SPII:
        console.warn(errorMessage);
        console.warn('Remove any personally identifiable information from your request.');
        break;
        
      case FinishReason.LANGUAGE:
        console.warn(errorMessage);
        console.warn('Try using English or another supported language.');
        break;
        
      case FinishReason.MALFORMED_FUNCTION_CALL:
      case FinishReason.UNEXPECTED_TOOL_CALL:
        console.error(errorMessage);
        console.error('This appears to be a tool execution issue. Please try again.');
        break;
        
      case FinishReason.IMAGE_SAFETY:
        console.warn(errorMessage);
        console.warn('The image content was flagged by safety filters.');
        console.warn('Please use different images or remove image content.');
        break;
        
      default:
        console.warn(errorMessage || 'Response generation was stopped unexpectedly.');
        console.warn('Please try rephrasing your request.');
        break;
    }
    
    throw new Error(errorMessage || 'Content generation stopped unexpectedly');
  }
}
```

### 2. Safety Filtering and Content Blocking

**Advanced Detection:**
```typescript
// Comprehensive safety and content filtering detection
function isContentBlocked(response: GenerateContentResponse): {
  blocked: boolean;
  reason?: string;
  category?: string;
} {
  const candidate = response.candidates?.[0];
  
  // Check finish reason first
  if (candidate?.finishReason) {
    const safetyReasons = [
      FinishReason.SAFETY,
      FinishReason.PROHIBITED_CONTENT,
      FinishReason.BLOCKLIST,
      FinishReason.SPII,
      FinishReason.IMAGE_SAFETY
    ];
    
    if (safetyReasons.includes(candidate.finishReason)) {
      return {
        blocked: true,
        reason: handleFinishReason(candidate.finishReason),
        category: 'finish_reason'
      };
    }
  }
  
  // Check prompt feedback blocking
  if (response.promptFeedback?.blockReason) {
    return {
      blocked: true,
      reason: `Input blocked: ${response.promptFeedback.blockReason}`,
      category: 'prompt_feedback'
    };
  }
  
  // Check safety ratings
  const safetyRatings = candidate?.safetyRatings;
  if (safetyRatings?.some(rating => rating.blocked)) {
    const blockedCategories = safetyRatings
      .filter(rating => rating.blocked)
      .map(rating => rating.category)
      .join(', ');
    
    return {
      blocked: true,
      reason: `Content blocked for categories: ${blockedCategories}`,
      category: 'safety_ratings'
    };
  }
  
  return { blocked: false };
}
```

**Enhanced Handling Strategy:**
```typescript
function handleContentBlocking(response: GenerateContentResponse) {
  const blockInfo = isContentBlocked(response);
  
  if (blockInfo.blocked) {
    console.warn('🛡️  Content was blocked by safety filters');
    console.warn(`Reason: ${blockInfo.reason}`);
    
    // Provide category-specific guidance
    switch (blockInfo.category) {
      case 'prompt_feedback':
        console.warn('\n📝 Your input was flagged before processing:');
        console.warn('• Review your prompt for sensitive content');
        console.warn('• Use more neutral, professional language');
        console.warn('• Remove any potentially harmful requests');
        break;
        
      case 'safety_ratings':
        console.warn('\n⚠️  The generated response was filtered:');
        console.warn('• Try rephrasing your question differently');
        console.warn('• Be more specific about your legitimate use case');
        console.warn('• Avoid requests that could generate harmful content');
        break;
        
      case 'finish_reason':
        console.warn('\n🔍 Content generation was stopped during processing:');
        console.warn('• Refine your request to be more appropriate');
        console.warn('• Consider breaking complex requests into parts');
        console.warn('• Ensure your use case aligns with content policies');
        break;
    }
    
    console.warn('\n💡 General tips:');
    console.warn('• Focus on educational, creative, or professional use cases');
    console.warn('• Avoid requests for illegal, harmful, or inappropriate content');
    console.warn('• Be specific about your intended use and context');
    
    throw new Error(`Content blocked: ${blockInfo.reason}`);
  }
}
```

### 3. Token Limit and Length Handling

**Enhanced Detection:**
```typescript
// Comprehensive token limit detection
function detectTokenLimitIssues(error: unknown, response?: GenerateContentResponse): {
  isTokenLimit: boolean;
  type?: 'input' | 'output' | 'context';
  tokenCount?: number;
  limit?: number;
} {
  // Check finish reason for token limits
  const candidate = response?.candidates?.[0];
  if (candidate?.finishReason === FinishReason.MAX_TOKENS) {
    return {
      isTokenLimit: true,
      type: 'output',
      tokenCount: response?.usageMetadata?.totalTokenCount,
      limit: undefined // Model-specific limits
    };
  }
  
  // Check error messages for token-related issues
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Input token limit patterns
    if (message.includes('input') && (message.includes('token') || message.includes('length'))) {
      return {
        isTokenLimit: true,
        type: 'input',
        tokenCount: extractTokenCount(message),
        limit: extractTokenLimit(message)
      };
    }
    
    // Context window exceeded
    if (message.includes('context') && message.includes('limit')) {
      return {
        isTokenLimit: true,
        type: 'context',
        tokenCount: extractTokenCount(message),
        limit: extractTokenLimit(message)
      };
    }
    
    // General token limit patterns
    if (message.includes('token') && (
      message.includes('limit') ||
      message.includes('exceed') ||
      message.includes('maximum') ||
      message.includes('too long')
    )) {
      return {
        isTokenLimit: true,
        type: 'input',
        tokenCount: extractTokenCount(message),
        limit: extractTokenLimit(message)
      };
    }
  }
  
  return { isTokenLimit: false };
}

function extractTokenCount(message: string): number | undefined {
  const match = message.match(/(\d+)\s*tokens?/i);
  return match ? parseInt(match[1], 10) : undefined;
}

function extractTokenLimit(message: string): number | undefined {
  const match = message.match(/limit(?:\s+of)?[:.]?\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : undefined;
}
```

**Comprehensive Handling Strategy:**
```typescript
function handleTokenLimitIssues(error: unknown, response?: GenerateContentResponse, chatHistory?: Content[]) {
  const tokenInfo = detectTokenLimitIssues(error, response);
  
  if (tokenInfo.isTokenLimit) {
    console.error('📏 Token limit exceeded');
    
    if (tokenInfo.tokenCount && tokenInfo.limit) {
      console.error(`Current: ${tokenInfo.tokenCount} tokens, Limit: ${tokenInfo.limit} tokens`);
    } else if (tokenInfo.tokenCount) {
      console.error(`Token count: ${tokenInfo.tokenCount}`);
    }
    
    switch (tokenInfo.type) {
      case 'input':
        console.error('\n📝 Input too long - try these solutions:');
        console.error('1. Break your request into smaller parts');
        console.error('2. Summarize or reduce the content');
        console.error('3. Remove unnecessary details');
        console.error('4. Use file summarization tools for large files');
        break;
        
      case 'output':
        console.warn('\n📄 Response was truncated - the model hit output limits:');
        console.warn('1. Ask for a continuation: "Please continue from where you left off"');
        console.warn('2. Request a more concise response');
        console.warn('3. Break your question into specific parts');
        break;
        
      case 'context':
        console.error('\n💬 Chat history too long - try these solutions:');
        console.error('1. Use /compress to reduce chat history');
        console.error('2. Use /clear to start fresh (loses context)');
        console.error('3. Export important information before clearing');
        
        if (chatHistory && chatHistory.length > 20) {
          console.error(`Current chat has ${chatHistory.length} messages`);
          console.error('4. Consider using /restore with key context only');
        }
        break;
    }
    
    console.error('\n⚡ Pro tips:');
    console.error('• Use shorter, more focused questions');
    console.error('• Reference specific files instead of pasting large content');
    console.error('• Use tools like grep and read-file for targeted information');
    
    const errorMsg = tokenInfo.type === 'output' 
      ? 'Response truncated due to token limits'
      : `Input too long for model (${tokenInfo.type} token limit exceeded)`;
    
    throw new Error(errorMsg);
  }
}

---

## Tool Execution Errors

### 1. Tool Parameter Validation

**Detection:**
```typescript
// Tool validation error patterns
const isToolValidationError = (error: Error) => {
  return (
    error.message.includes('validation') ||
    error.message.includes('parameter') ||
    error.message.includes('required') ||
    error.message.includes('invalid')
  );
};
```

**Handling Strategy:**
```typescript
// In tool implementation
validateToolParams(params: TParams): string | null {
  if (!params.path) {
    return 'Path parameter is required';
  }
  
  if (typeof params.path !== 'string') {
    return 'Path must be a string';
  }
  
  if (!fs.existsSync(params.path)) {
    return `File or directory does not exist: ${params.path}`;
  }
  
  return null; // Valid
}

// In tool execution
const validationError = tool.validateToolParams(params);
if (validationError) {
  console.error(`Tool validation failed: ${validationError}`);
  throw new Error(`Invalid tool parameters: ${validationError}`);
}
```

### 2. File System Permission Errors

**Detection:**
```typescript
import { isNodeError } from '@google/gemini-cli-core';

const isPermissionError = (error: unknown) => {
  return (
    isNodeError(error) && (
      error.code === 'EACCES' ||
      error.code === 'EPERM' ||
      error.code === 'ENOENT'
    )
  );
};
```

**Handling Strategy:**
```typescript
if (isPermissionError(error)) {
  switch (error.code) {
    case 'EACCES':
      console.error(`Permission denied accessing: ${error.path}`);
      console.error('Please check file/directory permissions.');
      break;
      
    case 'EPERM':
      console.error(`Operation not permitted: ${error.path}`);
      console.error('You may need administrator privileges.');
      break;
      
    case 'ENOENT':
      console.error(`File or directory not found: ${error.path}`);
      console.error('Please check the path exists.');
      break;
  }
  
  throw new Error(`File system error: ${error.message}`);
}
```

### 3. Command Execution Failures

**Detection:**
```typescript
// Shell command execution errors
const isCommandExecutionError = (error: any) => {
  return (
    error.status !== 0 || // Non-zero exit code
    error.signal || // Process killed by signal
    error.killed // Process was killed
  );
};
```

**Handling Strategy:**
```typescript
try {
  const result = execSync(command, { 
    encoding: 'utf8',
    timeout: 30000,
    cwd: workingDirectory 
  });
  return result;
} catch (error) {
  if (error.status !== 0) {
    console.error(`Command failed with exit code ${error.status}`);
    console.error(`Command: ${command}`);
    console.error(`stderr: ${error.stderr}`);
    
    // Provide specific guidance for common failures
    if (error.status === 127) {
      console.error('Command not found. Please check if the command is installed.');
    } else if (error.status === 126) {
      console.error('Command not executable. Please check permissions.');
    }
  }
  
  if (error.killed && error.signal === 'SIGTERM') {
    console.error('Command timed out and was killed.');
  }
  
  throw new Error(`Command execution failed: ${error.message}`);
}
```

### 4. MCP Server Communication Errors

**Detection:**
```typescript
// MCP (Model Context Protocol) server errors
const isMCPError = (error: Error) => {
  return (
    error.message.includes('MCP') ||
    error.message.includes('server') && error.message.includes('connect') ||
    error.message.includes('RPC')
  );
};
```

**Handling Strategy:**
```typescript
if (isMCPError(error)) {
  console.error('MCP server communication failed.');
  console.error('Please check:');
  console.error('1. MCP server is running');
  console.error('2. Server configuration is correct');
  console.error('3. Network connectivity to server');
  
  // Attempt to restart MCP connection
  try {
    await mcpClient.reconnect();
    console.log('Successfully reconnected to MCP server.');
  } catch (reconnectError) {
    console.error('Failed to reconnect to MCP server.');
    throw new Error('MCP server unavailable. Please check server status.');
  }
}
```

---

## Configuration and Startup Errors

### 1. Invalid Configuration Settings

**Detection:**
```typescript
// Configuration validation patterns
const isConfigError = (error: Error) => {
  return (
    error.message.includes('config') ||
    error.message.includes('setting') ||
    error.message.includes('invalid') && error.message.includes('value')
  );
};
```

**Handling Strategy:**
```typescript
// Configuration validation
function validateConfig(config: Config): string[] {
  const errors: string[] = [];
  
  // Validate model name
  const model = config.getModel();
  if (!SUPPORTED_MODELS.includes(model)) {
    errors.push(`Unsupported model: ${model}. Supported models: ${SUPPORTED_MODELS.join(', ')}`);
  }
  
  // Validate temperature
  const temperature = config.getTemperature();
  if (temperature < 0 || temperature > 2) {
    errors.push(`Invalid temperature: ${temperature}. Must be between 0 and 2.`);
  }
  
  // Validate working directory
  const workingDir = config.getWorkingDir();
  if (!fs.existsSync(workingDir)) {
    errors.push(`Working directory does not exist: ${workingDir}`);
  }
  
  return errors;
}

// Handle validation errors
const configErrors = validateConfig(config);
if (configErrors.length > 0) {
  console.error('Configuration errors found:');
  configErrors.forEach(error => console.error(`  - ${error}`));
  console.error('Please fix these issues and try again.');
  process.exit(1);
}
```

### 2. Missing Environment Variables

**Detection:**
```typescript
// Check for required environment variables
function validateEnvironment(): string[] {
  const errors: string[] = [];
  
  // Check for auth configuration
  if (!process.env.GEMINI_API_KEY && 
      !process.env.GOOGLE_APPLICATION_CREDENTIALS &&
      process.env.GOOGLE_GENAI_USE_VERTEXAI !== 'true') {
    errors.push(
      'No authentication method configured. Please set GEMINI_API_KEY, ' +
      'GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_GENAI_USE_VERTEXAI=true'
    );
  }
  
  // Check for proxy settings consistency
  if (process.env.HTTP_PROXY && !process.env.HTTPS_PROXY) {
    console.warn('HTTP_PROXY set but HTTPS_PROXY not set. This may cause issues.');
  }
  
  return errors;
}
```

**Handling Strategy:**
```typescript
const envErrors = validateEnvironment();
if (envErrors.length > 0) {
  console.error('Environment configuration errors:');
  envErrors.forEach(error => console.error(`  - ${error}`));
  console.error('\nPlease set the required environment variables and try again.');
  console.error('For help with authentication, run: gemini auth --help');
  process.exit(1);
}
```

### 3. Extension Loading Failures

**Detection:**
```typescript
// Extension loading error patterns
const isExtensionError = (error: Error) => {
  return (
    error.message.includes('extension') ||
    error.message.includes('plugin') ||
    error.message.includes('load') && error.message.includes('module')
  );
};
```

**Handling Strategy:**
```typescript
async function loadExtensions(extensionPaths: string[]): Promise<void> {
  for (const extensionPath of extensionPaths) {
    try {
      const extension = await import(extensionPath);
      await extension.initialize();
      console.log(`Loaded extension: ${extension.name}`);
    } catch (error) {
      // Don't fail startup for extension errors
      console.warn(`Failed to load extension ${extensionPath}: ${error.message}`);
      
      // But provide helpful guidance
      if (error.code === 'MODULE_NOT_FOUND') {
        console.warn('Extension module not found. Please check the path and ensure dependencies are installed.');
      } else if (error.message.includes('syntax')) {
        console.warn('Extension has syntax errors. Please check the extension code.');
      }
    }
  }
}
```

---

## Chat and Session Management Errors

### 1. History Corruption

**Detection:**
```typescript
// Chat history validation
function validateChatHistory(history: Content[]): boolean {
  // Check for alternating user/model pattern
  for (let i = 0; i < history.length; i++) {
    const content = history[i];
    
    if (!content.role || !['user', 'model'].includes(content.role)) {
      console.error(`Invalid role at index ${i}: ${content.role}`);
      return false;
    }
    
    if (!content.parts || content.parts.length === 0) {
      console.error(`Empty content at index ${i}`);
      return false;
    }
  }
  
  return true;
}
```

**Handling Strategy:**
```typescript
if (!validateChatHistory(history)) {
  console.warn('Chat history corruption detected. Attempting to repair...');
  
  // Attempt to repair history
  const repairedHistory = repairChatHistory(history);
  
  if (repairedHistory.length === 0) {
    console.warn('Unable to repair history. Starting fresh session.');
    await chat.clearHistory();
  } else {
    console.log(`Repaired history: kept ${repairedHistory.length}/${history.length} entries`);
    chat.setHistory(repairedHistory);
  }
}
```

### 2. Session Limit Exceeded

**Detection:**
```typescript
// Session turn limit detection
const isSessionLimitExceeded = (turnCount: number, maxTurns: number) => {
  return maxTurns > 0 && turnCount > maxTurns;
};
```

**Handling Strategy:**
```typescript
if (isSessionLimitExceeded(sessionTurnCount, maxSessionTurns)) {
  console.warn(`Session limit reached (${maxSessionTurns} turns).`);
  console.warn('Starting a new session to continue...');
  
  // Save important context before reset
  const contextSummary = await summarizeSession(chat.getHistory());
  
  // Reset session
  await chat.resetChat();
  sessionTurnCount = 0;
  
  // Restore essential context
  if (contextSummary) {
    await chat.addHistory({
      role: 'user',
      parts: [{ text: `Previous session context: ${contextSummary}` }]
    });
  }
}
```

### 3. Loop Detection

**Detection:**
```typescript
// Loop detection in conversation
class LoopDetectionService {
  private recentOutputs: string[] = [];
  private readonly maxHistory = 5;
  private readonly similarityThreshold = 0.8;
  
  addAndCheck(content: string): boolean {
    this.recentOutputs.push(content);
    
    if (this.recentOutputs.length > this.maxHistory) {
      this.recentOutputs.shift();
    }
    
    // Check for repetitive patterns
    if (this.recentOutputs.length >= 3) {
      const recent = this.recentOutputs.slice(-3);
      const similarities = this.calculateSimilarities(recent);
      
      if (similarities.every(sim => sim > this.similarityThreshold)) {
        return true; // Loop detected
      }
    }
    
    return false;
  }
}
```

**Handling Strategy:**
```typescript
if (loopDetector.addAndCheck(responseText)) {
  console.warn('Conversation loop detected. Breaking cycle...');
  
  // Add instruction to break the loop
  await chat.addHistory({
    role: 'user',
    parts: [{ 
      text: 'Please provide a different approach or ask for clarification to avoid repeating the same response.' 
    }]
  });
  
  // Reset loop detector
  loopDetector.reset();
  
  throw new Error('Conversation loop detected. Please try a different approach.');
}
```

### 4. Compression Failures

**Detection:**
```typescript
// Chat compression error detection
const isCompressionError = (error: Error) => {
  return (
    error.message.includes('compression') ||
    error.message.includes('summarize') ||
    error.message.includes('token count')
  );
};
```

**Handling Strategy:**
```typescript
try {
  const compressionResult = await client.tryCompressChat(promptId);
  if (compressionResult) {
    console.log(`Chat compressed: ${compressionResult.originalTokenCount} → ${compressionResult.newTokenCount} tokens`);
  }
} catch (error) {
  console.warn('Chat compression failed:', error.message);
  
  // Fallback: manual history truncation
  const history = chat.getHistory();
  const truncatedHistory = history.slice(-20); // Keep last 20 turns
  
  console.warn(`Fallback: truncated history to last ${truncatedHistory.length} turns`);
  chat.setHistory(truncatedHistory);
}
```

---

## Telemetry and Logging Errors

### 1. Report Generation Failures

**Detection:**
```typescript
// Error report generation failures
const isReportingError = (error: Error) => {
  return (
    error.message.includes('report') ||
    error.message.includes('stringify') ||
    error.message.includes('writeFile')
  );
};
```

**Handling Strategy:**
```typescript
async function reportError(
  error: Error,
  baseMessage: string,
  context?: unknown,
  type = 'general'
): Promise<void> {
  try {
    const report = {
      error: {
        message: error.message,
        stack: error.stack
      },
      context,
      timestamp: new Date().toISOString()
    };
    
    const reportPath = path.join(os.tmpdir(), `gemini-error-${type}-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.error(`${baseMessage} Error report saved to: ${reportPath}`);
  } catch (reportingError) {
    // Fallback to console logging if file writing fails
    console.error(`${baseMessage} Additionally, failed to write error report:`, reportingError);
    console.error('Original error:', error);
    
    if (context) {
      try {
        console.error('Context:', JSON.stringify(context).substring(0, 1000));
      } catch {
        console.error('Context could not be serialized');
      }
    }
  }
}
```

### 2. Metric Collection Problems

**Detection:**
```typescript
// Telemetry/metrics collection errors
const isTelemetryError = (error: Error) => {
  return (
    error.message.includes('telemetry') ||
    error.message.includes('metrics') ||
    error.message.includes('clearcut')
  );
};
```

**Handling Strategy:**
```typescript
try {
  await logApiRequest(config, requestEvent);
} catch (error) {
  // Don't fail the main operation for telemetry issues
  if (isTelemetryError(error)) {
    console.debug('Telemetry logging failed:', error.message);
    
    // Disable telemetry temporarily if persistent failures
    if (telemetryFailureCount++ > 5) {
      console.warn('Disabling telemetry due to persistent failures');
      config.setTelemetryEnabled(false);
    }
  } else {
    // Re-throw non-telemetry errors
    throw error;
  }
}
```

---

## Error Detection Patterns

### 1. Status Code Extraction

```typescript
function extractStatusCode(error: unknown): number | undefined {
  // Direct status property
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return (error as { status: number }).status;
  }
  
  // Response.status (fetch API)
  if (error?.response?.status) {
    return error.response.status;
  }
  
  // Extract from message
  if (error instanceof Error) {
    const match = error.message.match(/(\d{3})/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  
  return undefined;
}
```

### 2. Error Type Classification

```typescript
enum ErrorCategory {
  Authentication = 'auth',
  RateLimit = 'rate_limit',
  Network = 'network',
  Server = 'server',
  Content = 'content',
  Tool = 'tool',
  Configuration = 'config',
  Session = 'session',
  Unknown = 'unknown'
}

function classifyError(error: unknown): ErrorCategory {
  const status = extractStatusCode(error);
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  
  // Authentication errors
  if (status === 401 || status === 403) {
    return ErrorCategory.Authentication;
  }
  
  // Rate limiting
  if (status === 429 || message.includes('quota') || message.includes('rate limit')) {
    return ErrorCategory.RateLimit;
  }
  
  // Network errors
  if (message.includes('network') || message.includes('connection') || 
      message.includes('timeout') || message.includes('dns')) {
    return ErrorCategory.Network;
  }
  
  // Server errors
  if (status >= 500 && status < 600) {
    return ErrorCategory.Server;
  }
  
  // Content filtering
  if (message.includes('safety') || message.includes('blocked') || 
      message.includes('recitation')) {
    return ErrorCategory.Content;
  }
  
  // Tool errors
  if (message.includes('tool') || message.includes('parameter') || 
      message.includes('validation')) {
    return ErrorCategory.Tool;
  }
  
  // Configuration errors
  if (message.includes('config') || message.includes('setting') || 
      message.includes('environment')) {
    return ErrorCategory.Configuration;
  }
  
  // Session management
  if (message.includes('session') || message.includes('history') || 
      message.includes('compression')) {
    return ErrorCategory.Session;
  }
  
  return ErrorCategory.Unknown;
}
```

### 3. Transient vs Persistent Error Detection

```typescript
function isTransientError(error: unknown): boolean {
  const status = extractStatusCode(error);
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  
  // Network timeouts and connection issues are usually transient
  if (message.includes('timeout') || message.includes('connection')) {
    return true;
  }
  
  // Server errors are typically transient
  if (status >= 500 && status < 600) {
    return true;
  }
  
  // Rate limiting is transient
  if (status === 429) {
    return true;
  }
  
  // Authentication and client errors are usually persistent
  if (status >= 400 && status < 500 && status !== 429) {
    return false;
  }
  
  // Unknown errors default to transient for retry
  return true;
}
```

---

## Retry and Fallback Strategies

### 1. Exponential Backoff Implementation

```typescript
interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.3
};

async function retryWithExponentialBackoff<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier, jitterFactor } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config
  };
  
  let currentDelay = initialDelayMs;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      // Don't retry on the last attempt
      if (attempt === maxAttempts) {
        throw error;
      }
      
      // Don't retry persistent errors
      if (!isTransientError(error)) {
        throw error;
      }
      
      // Calculate delay with jitter
      const jitter = currentDelay * jitterFactor * (Math.random() * 2 - 1);
      const delayWithJitter = Math.max(0, currentDelay + jitter);
      
      console.warn(`Attempt ${attempt} failed. Retrying in ${delayWithJitter/1000}s...`);
      
      await new Promise(resolve => setTimeout(resolve, delayWithJitter));
      
      // Increase delay for next attempt
      currentDelay = Math.min(maxDelayMs, currentDelay * backoffMultiplier);
    }
  }
  
  throw new Error('All retry attempts exhausted');
}
```

### 2. Model Fallback Strategy

```typescript
class ModelFallbackManager {
  private readonly fallbackChain: string[];
  private currentModelIndex: number = 0;
  
  constructor(primaryModel: string) {
    this.fallbackChain = [
      primaryModel,
      DEFAULT_GEMINI_FLASH_MODEL,
      'gemini-1.5-flash', // Older stable version
      'text-bison' // Legacy model as last resort
    ];
  }
  
  async executeWithFallback<T>(
    operation: (model: string) => Promise<T>,
    authType: AuthType
  ): Promise<T> {
    for (let i = this.currentModelIndex; i < this.fallbackChain.length; i++) {
      const model = this.fallbackChain[i];
      
      try {
        const result = await operation(model);
        
        // Success - update current model if we fell back
        if (i > this.currentModelIndex) {
          this.currentModelIndex = i;
          console.warn(`Switched to ${model} model due to quota limits`);
        }
        
        return result;
      } catch (error) {
        // Only try fallback for quota errors with OAuth
        if (authType === AuthType.LOGIN_WITH_GOOGLE && 
            extractStatusCode(error) === 429) {
          
          if (i < this.fallbackChain.length - 1) {
            console.warn(`${model} quota exceeded, trying ${this.fallbackChain[i + 1]}...`);
            continue;
          }
        }
        
        // For other errors or if we're at the last model, throw
        throw error;
      }
    }
    
    throw new Error('All model fallback options exhausted');
  }
  
  reset() {
    this.currentModelIndex = 0;
  }
}
```

### 3. Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private readonly failureThreshold: number = 5,
    private readonly timeoutMs: number = 60000,
    private readonly retryDelayMs: number = 5000
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime < this.timeoutMs) {
        throw new Error('Circuit breaker is open - service temporarily unavailable');
      }
      // Move to half-open state
      this.state = 'half-open';
    }
    
    try {
      const result = await operation();
      
      // Success - reset circuit breaker
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failureCount = 0;
        console.log('Circuit breaker reset - service recovered');
      }
      
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
  
  private recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      console.error(`Circuit breaker opened - service unavailable for ${this.timeoutMs/1000}s`);
    }
  }
}
```

---

## User Messaging Guidelines

### 1. Error Message Formatting

```typescript
interface ErrorDisplayOptions {
  showTechnicalDetails: boolean;
  includeActionableSteps: boolean;
  showContactInfo: boolean;
}

function formatErrorForUser(
  error: unknown,
  category: ErrorCategory,
  options: ErrorDisplayOptions = {
    showTechnicalDetails: false,
    includeActionableSteps: true,
    showContactInfo: false
  }
): string {
  const messages: string[] = [];
  
  // User-friendly error description
  messages.push(getUserFriendlyMessage(error, category));
  
  // Actionable steps
  if (options.includeActionableSteps) {
    const steps = getActionableSteps(category);
    if (steps.length > 0) {
      messages.push('\nWhat you can do:');
      steps.forEach((step, index) => {
        messages.push(`${index + 1}. ${step}`);
      });
    }
  }
  
  // Technical details (for debugging)
  if (options.showTechnicalDetails && error instanceof Error) {
    messages.push('\nTechnical details:');
    messages.push(error.message);
    if (error.stack) {
      messages.push(error.stack);
    }
  }
  
  // Contact information
  if (options.showContactInfo) {
    messages.push('\nIf the problem persists:');
    messages.push('- Check the documentation: https://developers.google.com/gemini/');
    messages.push('- Report issues: https://github.com/google-gemini/gemini-cli/issues');
  }
  
  return messages.join('\n');
}

function getUserFriendlyMessage(error: unknown, category: ErrorCategory): string {
  switch (category) {
    case ErrorCategory.Authentication:
      return 'Authentication failed. Your credentials may be expired or invalid.';
      
    case ErrorCategory.RateLimit:
      return 'You\'ve reached your usage limits. Please wait before trying again.';
      
    case ErrorCategory.Network:
      return 'Network connection failed. Please check your internet connection.';
      
    case ErrorCategory.Server:
      return 'The service is temporarily unavailable. Please try again in a few moments.';
      
    case ErrorCategory.Content:
      return 'Your request was blocked by content filters. Please rephrase your request.';
      
    case ErrorCategory.Tool:
      return 'Tool execution failed. Please check your parameters and try again.';
      
    case ErrorCategory.Configuration:
      return 'Configuration error detected. Please check your settings.';
      
    case ErrorCategory.Session:
      return 'Session error occurred. Your conversation may need to be reset.';
      
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

function getActionableSteps(category: ErrorCategory): string[] {
  switch (category) {
    case ErrorCategory.Authentication:
      return [
        'Run `/auth` to re-authenticate',
        'Check your API key or credentials',
        'Verify your project has Gemini API access enabled'
      ];
      
    case ErrorCategory.RateLimit:
      return [
        'Wait a few minutes before trying again',
        'Consider upgrading your plan for higher limits',
        'Use `/auth` to switch to a different API key'
      ];
      
    case ErrorCategory.Network:
      return [
        'Check your internet connection',
        'Verify proxy settings if applicable',
        'Try again in a few moments'
      ];
      
    case ErrorCategory.Server:
      return [
        'Wait a few minutes and try again',
        'Check the service status page',
        'Try using a different model'
      ];
      
    case ErrorCategory.Content:
      return [
        'Rephrase your request using different words',
        'Make your request more specific',
        'Avoid potentially sensitive topics'
      ];
      
    case ErrorCategory.Tool:
      return [
        'Check that file paths exist and are accessible',
        'Verify command syntax and parameters',
        'Ensure you have necessary permissions'
      ];
      
    case ErrorCategory.Configuration:
      return [
        'Review your configuration file',
        'Check environment variables',
        'Run `/settings` to verify current settings'
      ];
      
    case ErrorCategory.Session:
      return [
        'Try using `/clear` to reset the conversation',
        'Use `/compress` if your chat is very long',
        'Restart the CLI if the problem persists'
      ];
      
    default:
      return [
        'Try the operation again',
        'Check the CLI documentation',
        'Report the issue if it persists'
      ];
  }
}
```

### 2. Progressive Error Disclosure

```typescript
class ErrorPresenter {
  private verbosityLevel: 'basic' | 'detailed' | 'debug' = 'basic';
  
  setVerbosity(level: 'basic' | 'detailed' | 'debug') {
    this.verbosityLevel = level;
  }
  
  presentError(error: unknown): void {
    const category = classifyError(error);
    
    switch (this.verbosityLevel) {
      case 'basic':
        console.error(formatErrorForUser(error, category, {
          showTechnicalDetails: false,
          includeActionableSteps: true,
          showContactInfo: false
        }));
        break;
        
      case 'detailed':
        console.error(formatErrorForUser(error, category, {
          showTechnicalDetails: true,
          includeActionableSteps: true,
          showContactInfo: true
        }));
        break;
        
      case 'debug':
        console.error('=== DEBUG ERROR INFORMATION ===');
        console.error('Error category:', category);
        console.error('Error classification:', classifyError(error));
        console.error('Is transient:', isTransientError(error));
        console.error('Raw error:', error);
        console.error(formatErrorForUser(error, category, {
          showTechnicalDetails: true,
          includeActionableSteps: true,
          showContactInfo: true
        }));
        break;
    }
  }
}
```

### 3. Context-Aware Messaging

```typescript
function getContextualErrorMessage(
  error: unknown,
  context: {
    authType?: AuthType;
    userTier?: UserTierId;
    currentModel?: string;
    isInteractive?: boolean;
  }
): string {
  const { authType, userTier, currentModel, isInteractive } = context;
  
  if (extractStatusCode(error) === 429) {
    // Quota-specific messaging based on auth type and user tier
    if (authType === AuthType.LOGIN_WITH_GOOGLE) {
      if (userTier === UserTierId.FREE) {
        return 'You\'ve reached your free tier quota limit. ' +
               'Upgrade to Gemini Code Assist Standard for higher limits, ' +
               'or use `/auth` to switch to a paid API key.';
      } else {
        return `You've reached your ${currentModel} quota limit. ` +
               'Consider using a paid API key from AI Studio for continued access.';
      }
    } else if (authType === AuthType.USE_GEMINI) {
      return 'API quota exceeded. Request a quota increase through AI Studio.';
    } else {
      return 'Quota limit reached. Please check your usage limits.';
    }
  }
  
  if (extractStatusCode(error) === 401) {
    if (authType === AuthType.LOGIN_WITH_GOOGLE) {
      return 'Google authentication expired. Please run `/auth` to re-authenticate.';
    } else if (authType === AuthType.USE_GEMINI) {
      return 'API key is invalid or expired. Please check your GEMINI_API_KEY.';
    } else {
      return 'Authentication failed. Please verify your credentials.';
    }
  }
  
  // Default to generic message
  return getUserFriendlyMessage(error, classifyError(error));
}
```

---

## Best Practices Summary

### 1. Error Handling Principles

- **Fail Fast, Recover Gracefully**: Detect errors early and provide clear recovery paths
- **User-Centric Messaging**: Focus on what users can do to fix issues
- **Progressive Disclosure**: Show appropriate detail level based on context
- **Contextual Guidance**: Tailor messages to user's auth type, tier, and situation
- **Graceful Degradation**: Provide fallback options when primary functionality fails

### 2. Implementation Checklist

- [ ] Implement comprehensive error classification system
- [ ] Add retry logic with exponential backoff for transient errors
- [ ] Implement model fallback for quota-related errors
- [ ] Provide user-friendly error messages with actionable steps
- [ ] Add error reporting for debugging and analysis
- [ ] Implement circuit breaker pattern for service reliability
- [ ] Test error scenarios in different auth contexts
- [ ] Document error handling for each component
- [ ] Monitor error rates and patterns in production

### 3. Testing Error Scenarios

```typescript
// Example test cases for error handling
describe('Error Handling', () => {
  it('should handle 401 authentication errors', async () => {
    const mockError = { status: 401, message: 'Unauthorized' };
    const result = await handleApiError(mockError);
    expect(result.shouldRetry).toBe(false);
    expect(result.userMessage).toContain('authentication');
  });
  
  it('should retry on transient 500 errors', async () => {
    const mockError = { status: 500, message: 'Internal Server Error' };
    const result = await handleApiError(mockError);
    expect(result.shouldRetry).toBe(true);
    expect(result.retryDelayMs).toBeGreaterThan(0);
  });
  
  it('should fallback to Flash model on Pro quota exceeded', async () => {
    const mockError = {
      status: 429,
      message: "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'"
    };
    const result = await handleQuotaError(mockError, AuthType.LOGIN_WITH_GOOGLE);
    expect(result.fallbackModel).toBe(DEFAULT_GEMINI_FLASH_MODEL);
  });
});
```

This comprehensive guide provides developers with all the information needed to intelligently handle errors from the Gemini CLI and API, ensuring robust and user-friendly error handling across all scenarios.