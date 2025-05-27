import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { RallyClient } from './rally/client.js';
import { loadConfig } from './config.js';
import { registerResources } from './handlers/resources.js';
import { registerTools } from './handlers/tools.js';
import express from 'express';
import * as http from 'http';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

// Detect if we're being run by Claude Desktop or directly
const isRunFromClaude = !process.stdout.isTTY;

/**
 * Custom logger that ensures output goes only to stderr when in STDIO mode
 * This prevents interference with the MCP protocol communication
 */
class Logger {
  private static instance: Logger;
  private logFile: fs.WriteStream | null = null;

  private constructor() {
    // Create logs directory if it doesn't exist
    try {
      // Use relative path for logs directory
      const logsDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      // Create log file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFilePath = path.join(logsDir, `server-${timestamp}.log`);
      
      try {
        this.logFile = fs.createWriteStream(logFilePath, { flags: 'a' });
      } catch (error) {
        console.error(`Failed to create log file: ${error}. Falling back to stderr.`);
      }
    } catch (error) {
      console.error(`Failed to set up logging: ${error}. Falling back to stderr.`);
    }
    
    // Override console methods to add timestamps and log to file
    this.overrideConsole();
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private overrideConsole() {
    // Store original methods
    const originalConsoleLog = console.log;
    const originalConsoleInfo = console.info;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;

    // Override all console methods to redirect appropriately
    console.log = (...args: any[]) => this.log('LOG', args);
    console.info = (...args: any[]) => this.log('INFO', args);
    console.warn = (...args: any[]) => this.log('WARN', args);
    console.error = (...args: any[]) => this.log('ERROR', args);

    // Apply these overrides to stdout and stderr as well for extra safety
    const writeOut = process.stdout.write;
    process.stdout.write = function(buffer: any, ...args: any[]): boolean {
      if (isRunFromClaude) {
        // In STDIO mode, don't write to stdout unless it's part of the MCP protocol
        return true;
      }
      // @ts-ignore - TS doesn't handle the spread operator well here
      return writeOut.apply(process.stdout, [buffer, ...args]);
    };
  }

  private log(level: string, args: any[]) {
    // Format the message
    const msg = util.format(...args);
    const timestamp = new Date().toISOString();
    const formattedMsg = `[${timestamp}] [${level}] ${msg}`;

    // Write to stderr
    process.stderr.write(formattedMsg + '\n');

    // If logging to file is enabled, write there too
    if (this.logFile) {
      this.logFile.write(formattedMsg + '\n');
    }
  }

  // Public logging methods
  debug(...args: any[]) {
    if (process.env.LOG_LEVEL === 'debug') {
      this.log('DEBUG', args);
    }
  }

  info(...args: any[]) {
    const levels = ['debug', 'info'];
    if (levels.includes(process.env.LOG_LEVEL || 'info')) {
      this.log('INFO', args);
    }
  }

  warn(...args: any[]) {
    const levels = ['debug', 'info', 'warn'];
    if (levels.includes(process.env.LOG_LEVEL || 'info')) {
      this.log('WARN', args);
    }
  }

  error(...args: any[]) {
    this.log('ERROR', args);
  }
}

// Initialize the logger
const logger = Logger.getInstance();

/**
 * Check if a port is available
 */
const isPortAvailable = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', () => {
      resolve(false);
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port, '127.0.0.1');
  });
};

/**
 * Find an available port, starting from the given port
 */
const findAvailablePort = async (startPort: number): Promise<number> => {
  let port = startPort;
  
  while (!(await isPortAvailable(port))) {
    logger.info(`Port ${port} is already in use, trying ${port + 1}...`);
    port++;
    
    // Prevent infinite loop by setting a reasonable limit
    if (port > startPort + 100) {
      throw new Error(`Unable to find an available port after trying 100 ports starting from ${startPort}`);
    }
  }
  
  return port;
};

/**
 * Create and configure the MCP server
 */
async function createServer(rallyClient: RallyClient): Promise<McpServer> {
  // Create MCP server with explicit capabilities
  const server = new McpServer({
    name: 'mcp-rally-server',
    version: '1.0.0',
    capabilities: {
      resources: {},
      tools: {},
      resourceListing: true
    }
  });
  
  // In the createServer function
  logger.info('Server created with capabilities enabled');
  
  // Set up progress update handler for long-running operations
  // Note: Removed server.on('initialize') call as it's not supported
  
  // Add progress update mechanism for long-running operations
  const sendProgressUpdate = (operation: string, progress: number, message: string) => {
    logger.info(`Progress update for ${operation}: ${progress}% - ${message}`);
    
    // Send progress update through the MCP protocol
    try {
      // Create a progress notification
      const progressNotification = {
        jsonrpc: '2.0',
        method: 'progress',
        params: {
          operation,
          progress,
          message
        }
      };
      
      // Send directly to stdout for STDIO mode
      if (!process.argv.includes('--http')) {
        const directWrite = process.stdout.write.bind(process.stdout);
        directWrite(JSON.stringify(progressNotification) + '\n');
      }
      // For HTTP mode, the SDK will handle progress updates
    } catch (error) {
      logger.error(`Failed to send progress update: ${error}`);
    }
  };
  
  // Register handlers with progress update capability
  registerResources(server, rallyClient);
  registerTools(server, rallyClient);
  
  // Make progress update function available to handlers
  (server as any).sendProgressUpdate = sendProgressUpdate;
  
  return server;
}

/**
 * Set up the MCP server with proper initialization handling and progress updates
 */
async function setupServer(rallyClient: RallyClient): Promise<McpServer> {
  // Create the base server with createServer and await the Promise
  const server = await createServer(rallyClient);
  
  // We don't use server.on('initialize') as it's not supported by McpServer
  // Instead, initialization is handled by the transport layer in startStdioServer/startHttpServer
  
  // Make the rallyClient available to the server for background validation
  (server as any).rallyClient = rallyClient;
  
  return server;
}

/**
 * Start the server in HTTP mode
 */
async function startHttpServer(server: McpServer, config: any): Promise<http.Server> {
  // Set up Express server for HTTP transport
  const app = express();
  app.use(express.json());
  
  // Add a simple health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  // Create a map to store transports by session ID
  const transports: Record<string, StreamableHTTPServerTransport> = {};
  
  app.post('/mcp', async (req, res) => {
    logger.info(`Received POST request: ${req.body?.method || 'unknown'}`);
    
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;
    
    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId];
    } else {
      // Create new transport for a new session
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => Math.random().toString(36).substring(2, 15),
        onsessioninitialized: (sid: string) => {
          logger.info(`Session initialized: ${sid}`);
          transports[sid] = transport;
        }
      });
      
      // Clean up when transport is closed
      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
      };
      
      // Connect to the MCP server
      await server.connect(transport);
    }
    
    // Handle the request
    await transport.handleRequest(req, res, req.body);
  });
  
  // Handle session-based requests (GET, DELETE)
  const handleSessionRequest = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  };
  
  // Set up routes for GET and DELETE
  app.get('/mcp', handleSessionRequest);
  app.delete('/mcp', handleSessionRequest);
  
  // Start the Express server
  const port = process.env.PORT || 3000;
  return new Promise((resolve) => {
    const httpServer = app.listen(port, () => {
      httpServer.timeout = config.requestTimeout; // Set server timeout
      logger.info(`HTTP server listening on port ${port}`);
      resolve(httpServer);
    });
  });
}

/**
 * Handle STDIO directly for Claude Desktop integration
 */
async function startCustomStdioServer(server: McpServer) {
  // Don't log to stdout in custom STDIO mode to avoid corrupting the protocol
  logger.info('Starting in custom STDIO mode for Claude Desktop...');

  // Set up direct STDIN/STDOUT handling
  let buffer = '';
  let initializationHandled = false;
  
  // Handle incoming data from STDIN
  process.stdin.on('data', async (chunk) => {
    buffer += chunk.toString();
    
    // Try to parse complete JSON messages
    if (buffer.includes('\n')) {
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          // Parse the message
          const message = JSON.parse(line);
          logger.info(`Received message: ${message.method}`);
          
          // Handle initialization specifically for testing
          if (message.method === 'initialize' && !initializationHandled) {
            initializationHandled = true;
            
            // Prepare the response
            const response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                  resources: { listChanged: true },
                  tools: { listChanged: true }
                },
                serverInfo: {
                  name: 'mcp-rally-server',
                  version: '1.0.0',
                  capabilities: {
                    resources: {},
                    tools: {},
                    resourceListing: true
                  }
                }
              }
            };
            
            logger.info('Preparing initialize response');
            
            // Completely bypass all logging and console overrides
            try {
              // Use a direct write to stdout that bypasses all overrides
              const responseText = JSON.stringify(response) + '\n';
              
              // Use the original write function from the stdout object
              const originalWrite = Object.getPrototypeOf(process.stdout).write;
              originalWrite.call(process.stdout, responseText);
              
              logger.info(`Sent initialize response: ${responseText}`);
              
              // Don't set up the standard transport if we've handled initialization directly
              return;
            } catch (error) {
              logger.error(`Failed to send initialize response: ${error}`);
            }
          }
        } catch (error) {
          logger.error(`Failed to parse message: ${error}`);
        }
      }
    }
  });
  
  // Only set up the standard transport if we haven't handled initialization directly
  if (!initializationHandled) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('STDIO server started and connected');
  }
}

/**
 * Start the server in STDIO mode (for Claude Desktop)
 */
async function startStdioServer(server: McpServer) {
  console.log("Starting stdioServer");
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

/**
 * Perform background validation of Rally API credentials
 */
async function startBackgroundValidation(server: McpServer) {
  logger.info('Starting background validation after initialization response');
  
  // Get the Rally client from the server
  const rallyClient = (server as any).rallyClient;
  if (!rallyClient) {
    logger.error('No Rally client available for background validation');
    return;
  }
  
  // Send progress updates for background tasks
  const sendProgress = (server as any).sendProgressUpdate;
  if (typeof sendProgress === 'function') {
    sendProgress('server_initialization', 10, 'Server initialized, validating Rally API connection');
    
    try {
      // Perform lightweight API check
      await rallyClient.validateCredentials();
      sendProgress('server_initialization', 100, 'Rally API connection validated successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Rally API validation failed: ${errorMessage}`);
      sendProgress('server_initialization', 100, 'Server ready with warnings (Rally API validation failed)');
    }
  }
}

/**
 * Progress tracker for long-running operations
 */
class ProgressTracker {
  private static instance: ProgressTracker;
  private operations: Map<string, { progress: number, timer: NodeJS.Timeout }> = new Map();
  
  private constructor() {}
  
  public static getInstance(): ProgressTracker {
    if (!ProgressTracker.instance) {
      ProgressTracker.instance = new ProgressTracker();
    }
    return ProgressTracker.instance;
  }
  
  /**
   * Start tracking progress for an operation
   * @param operationId Unique identifier for the operation
   * @param totalSteps Total number of steps in the operation
   * @param callback Function to call with progress updates
   */
  public startOperation(operationId: string, callback: (progress: number, message: string) => void): void {
    // Initialize progress at 0%
    this.operations.set(operationId, { 
      progress: 0,
      timer: setInterval(() => {
        const operation = this.operations.get(operationId);
        if (operation) {
          // Increment progress by a small amount to show activity
          // Cap at 95% to indicate we're still working but not complete
          const newProgress = Math.min(95, operation.progress + 5);
          this.updateProgress(operationId, newProgress, 'Operation in progress...');
          callback(newProgress, 'Operation in progress...');
        }
      }, 5000) // Send updates every 5 seconds
    });
    
    // Initial progress update
    callback(0, 'Starting operation...');
    logger.info(`Started progress tracking for operation: ${operationId}`);
  }
  
  /**
   * Update progress for an operation
   * @param operationId Unique identifier for the operation
   * @param progress Progress percentage (0-100)
   * @param message Status message
   */
  public updateProgress(operationId: string, progress: number, message: string): void {
    const operation = this.operations.get(operationId);
    if (operation) {
      operation.progress = progress;
      logger.info(`Progress update for ${operationId}: ${progress}% - ${message}`);
    }
  }
  
  /**
   * Complete an operation
   * @param operationId Unique identifier for the operation
   */
  public completeOperation(operationId: string, callback: (progress: number, message: string) => void): void {
    const operation = this.operations.get(operationId);
    if (operation) {
      clearInterval(operation.timer);
      this.operations.delete(operationId);
      callback(100, 'Operation completed successfully');
      logger.info(`Completed operation: ${operationId}`);
    }
  }
}

/**
 * Main entry point for the MCP Rally server
 */
async function main() {
  try {
    // Load config and create Rally client
    const config = loadConfig();
    const rallyClient = new RallyClient(config);
    
    // Start validation in background immediately
    logger.info('Starting Rally API validation in background');
    const validationPromise = rallyClient.validateCredentials().catch(err => {
      logger.error(`Background Rally API validation error: ${err.message}`);
      return { valid: false, error: err.message };
    });
    
    // Create the MCP server without waiting for validation
    logger.info('Initializing MCP server...');
    // Use setupServer instead of createServer
    const server = await setupServer(rallyClient);
    
    // Start server with appropriate transport
    const useHttp = process.argv.includes('--http');

    // Start the server immediately
    if (useHttp) {
      const httpServer = await startHttpServer(server, config);
      httpServer.on('listening', () => {
        logger.info(`HTTP server is listening on port ${process.env.PORT || 3000}`);
      });
    } else {
      await startStdioServer(server);
    }
    
    // Handle validation result in background
    validationPromise.then(result => {
      if (result.valid) {
        logger.info('Rally API validation completed successfully');
      } else {
        logger.warn(`WARNING: Rally API credentials issue detected - ${result.error}`);
        logger.warn('The server is running, but Rally API calls may fail');
        logger.warn('Check your .env file and make sure RALLY_API_KEY and RALLY_WORKSPACE are correct');
      }
    });
  } catch (error) {
    logger.error(`Server failed to start: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Set up process event handlers
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`);
  logger.error(error.stack || 'No stack trace available');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
  // Don't exit here, just log the error
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the server
main().catch(error => {
  logger.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});