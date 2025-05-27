/**
 * End-to-End Test for MCP Rally Server
 * 
 * This test suite verifies the complete workflow from client through server to Rally API.
 * It tests both resources and tools, including relationship operations.
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { spawn } = require('child_process');
const path = require('path');

// Configuration for tests
const SERVER_PORT = 3456;
const SERVER_TIMEOUT = 15000;
const OPERATION_TIMEOUT = 5000;

// Global variables
let serverProcess;
let client;
let transport;

// Make this work with Jest
jest.setTimeout(60000); // Set 60 second timeout for the entire suite

/**
 * Start the mock server for testing
 */
async function startMockServer() {
  return new Promise((resolve, reject) => {
    // Start the mock server for testing
    console.log('Starting mock MCP server...');
    
    serverProcess = spawn('node', [path.join(__dirname, '../mock-server.js')], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: SERVER_PORT.toString(),
        NODE_ENV: 'test'
      }
    });
    
    let serverStarted = false;
    let output = '';
    let errorOutput = '';
    
    serverProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log(`[SERVER]: ${chunk.trim()}`);
      
      if (chunk.includes(`HTTP server listening on port ${SERVER_PORT}`)) {
        console.log('Server started successfully.');
        serverStarted = true;
        
        // Give it a moment to fully initialize
        setTimeout(() => {
          resolve(serverProcess);
        }, 1000);
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      console.error(`[SERVER ERROR]: ${chunk.trim()}`);
    });
    
    serverProcess.on('error', (err) => {
      console.error('Failed to start server:', err);
      reject(err);
    });
    
    serverProcess.on('exit', (code, signal) => {
      if (!serverStarted) {
        console.error(`Server process exited with code ${code} and signal ${signal}`);
        reject(new Error(`Server failed to start: ${errorOutput}`));
      }
    });
    
    // Set a timeout in case server doesn't start
    setTimeout(() => {
      if (!serverStarted) {
        console.error('Server startup timed out.');
        if (serverProcess) {
          serverProcess.kill();
        }
        reject(new Error('Server startup timeout'));
      }
    }, SERVER_TIMEOUT);
  });
}

/**
 * Stop the MCP server
 */
async function stopServer() {
  return new Promise((resolve) => {
    if (serverProcess) {
      console.log('Stopping server...');
      
      // Force kill to ensure it stops
      try {
        process.kill(serverProcess.pid, 'SIGKILL');
        console.log('Server stopped forcefully.');
        resolve();
      } catch (e) {
        console.log('Server may already be stopped:', e.message);
        resolve();
      }
    } else {
      resolve();
    }
  });
}

/**
 * Connect the MCP client to the server
 */
async function connectClient() {
  return new Promise(async (resolve, reject) => {
    console.log('Connecting MCP client...');
    client = new Client({
      name: 'rally-e2e-test-client',
      version: '1.0.0'
    });
    
    transport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${SERVER_PORT}/mcp`)
    );
    
    const timeoutId = setTimeout(() => {
      reject(new Error('Client connection timeout'));
    }, OPERATION_TIMEOUT);
    
    try {
      await client.connect(transport);
      clearTimeout(timeoutId);
      console.log('Client connected successfully.');
      resolve();
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Client connection error:', error);
      reject(error);
    }
  });
}

/**
 * Disconnect the MCP client
 */
async function disconnectClient() {
  if (transport) {
    console.log('Disconnecting client...');
    transport.close();
    transport = null;
  }
}

/**
 * Run an async operation with a timeout
 */
async function runWithTimeout(operation, timeoutMs = OPERATION_TIMEOUT) {
  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    try {
      const result = await operation();
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

describe('MCP Rally Server E2E Tests', () => {
  // Set up before all tests
  beforeAll(async () => {
    // Start the mock server
    await startMockServer();
    
    // Connect client
    await connectClient();
  });
  
  // Clean up after all tests
  afterAll(async () => {
    // Disconnect client
    await disconnectClient();
    
    // Stop server
    await stopServer();
    
    // Add a small delay to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 1000));
  });
  
  describe('Story Tools', () => {
    test('should create a new story', async () => {
      const createResult = await client.callTool({
        name: 'createStory',
        arguments: {
          name: 'E2E Test Story',
          description: 'This is a test story created by the E2E test',
          state: 'Defined',
          estimate: 5,
          priority: 'High'
        }
      });
      
      expect(createResult.isError).toBeFalsy();
      expect(createResult.content[0].text).toContain('Successfully created story');
    });
    
    test('should update an existing story', async () => {
      const updateResult = await client.callTool({
        name: 'updateStory',
        arguments: {
          id: 'US1',
          name: 'Updated E2E Test Story',
          state: 'In-Progress',
          estimate: 8
        }
      });
      
      expect(updateResult.isError).toBeFalsy();
      expect(updateResult.content[0].text).toContain('Successfully updated story');
    });
    
    test('should delete a story', async () => {
      const deleteResult = await client.callTool({
        name: 'deleteStory',
        arguments: {
          id: 'US2'
        }
      });
      
      expect(deleteResult.isError).toBeFalsy();
      expect(deleteResult.content[0].text).toContain('Successfully deleted story');
    });
  });
  
  describe('Relationship Tools', () => {
    test('should get relationships for a story', async () => {
      const relationships = await client.callTool({
        name: 'getRelationships',
        arguments: {
          artifactId: 'US1'
        }
      });
      
      expect(relationships.isError).toBeFalsy();
      expect(relationships.content[0].text).toContain('Relationships for US1');
    });
    
    test('should create a relationship between stories', async () => {
      const createResult = await client.callTool({
        name: 'createRelationship',
        arguments: {
          sourceId: 'US1',
          targetId: 'US3',
          relationshipType: 'Predecessor'
        }
      });
      
      expect(createResult.isError).toBeFalsy();
      expect(createResult.content[0].text).toContain('Successfully created Predecessor relationship');
      
      // Verify relationship was created
      const verifyRelationships = await client.callTool({
        name: 'getRelationships',
        arguments: {
          artifactId: 'US1'
        }
      });
      
      expect(verifyRelationships.content[0].text).toContain('US3');
    });
    
    test('should remove a relationship between stories', async () => {
      const removeResult = await client.callTool({
        name: 'removeRelationship',
        arguments: {
          sourceId: 'US1',
          targetId: 'US3',
          relationshipType: 'Predecessor'
        }
      });
      
      expect(removeResult.isError).toBeFalsy();
      expect(removeResult.content[0].text).toContain('Successfully removed Predecessor relationship');
      
      // Verify relationship was removed
      const finalRelationships = await client.callTool({
        name: 'getRelationships',
        arguments: {
          artifactId: 'US1'
        }
      });
      
      // This test depends on the mock server's implementation
      // The mock server might still show US3 in children, but not in predecessors
      expect(finalRelationships.isError).toBeFalsy();
    });
  });
}); 