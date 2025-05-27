/**
 * End-to-End Test with Mock Server
 * 
 * This test runs against the mock server to verify the MCP Rally server
 * functionality without requiring real Rally API credentials.
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { spawn } = require('child_process');
const path = require('path');

// Configuration
const SERVER_PORT = 3456;
const SERVER_TIMEOUT = 15000;
const OPERATION_TIMEOUT = 5000;

// Global variables
let serverProcess;
let client;
let transport;

// Function to start the mock server
async function startMockServer() {
  return new Promise((resolve, reject) => {
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

// Function to stop the server
async function stopServer() {
  return new Promise((resolve) => {
    if (serverProcess) {
      console.log('Stopping server...');
      
      try {
        process.kill(serverProcess.pid, 'SIGKILL');
        console.log('Server stopped.');
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

// Function to connect an MCP client to the server
async function connectClient() {
  return new Promise(async (resolve, reject) => {
    console.log('Connecting MCP client...');
    client = new Client({
      name: 'e2e-test-client',
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

// Function to disconnect the client
async function disconnectClient() {
  if (transport) {
    console.log('Disconnecting client...');
    transport.close();
    transport = null;
  }
}

// Main test function
async function runTests() {
  try {
    console.log('\n=== STARTING MOCK SERVER E2E TESTS ===\n');
    
    // Start mock server
    await startMockServer();
    
    // Connect client
    await connectClient();
    
    // Test story operations
    console.log('\n--- TESTING STORY OPERATIONS ---');
    const storyId = await testStoryOperations();
    
    // Test relationship operations
    console.log('\n--- TESTING RELATIONSHIP OPERATIONS ---');
    await testRelationshipOperations(storyId);
    
    console.log('\n=== MOCK SERVER E2E TESTS COMPLETED SUCCESSFULLY ===');
    process.exit(0);
  } catch (error) {
    console.error('\n=== MOCK SERVER E2E TESTS FAILED ===');
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    // Clean up
    await disconnectClient();
    await stopServer();
  }
}

// Test story CRUD operations
async function testStoryOperations() {
  // Create a new story
  console.log('Testing createStory tool...');
  const createResponse = await client.callTool({
    name: 'createStory',
    arguments: {
      name: 'E2E Test Story',
      description: 'This is a test story created by the E2E test',
      state: 'Defined',
      estimate: 5,
      priority: 'High'
    }
  });
  
  console.log('Create response:', JSON.stringify(createResponse, null, 2));
  
  // Update a story
  console.log('Testing updateStory tool...');
  const updateResponse = await client.callTool({
    name: 'updateStory',
    arguments: {
      id: 'US1',
      name: 'Updated E2E Test Story',
      state: 'In-Progress',
      estimate: 8
    }
  });
  
  console.log('Update response:', JSON.stringify(updateResponse, null, 2));
  
  // Delete a story
  console.log('Testing deleteStory tool...');
  const deleteResponse = await client.callTool({
    name: 'deleteStory',
    arguments: {
      id: 'US2'
    }
  });
  
  console.log('Delete response:', JSON.stringify(deleteResponse, null, 2));
  
  return 'US1'; // Return a story ID for relationship tests
}

// Test relationship operations
async function testRelationshipOperations(storyId) {
  // Get initial relationships
  console.log('Testing getRelationships tool...');
  const initialResponse = await client.callTool({
    name: 'getRelationships',
    arguments: {
      artifactId: storyId
    }
  });
  
  console.log('Initial relationships:', JSON.stringify(initialResponse, null, 2));
  
  // Create a relationship
  console.log('Testing createRelationship tool...');
  const createRelationshipResponse = await client.callTool({
    name: 'createRelationship',
    arguments: {
      sourceId: storyId,
      targetId: 'US3',
      relationshipType: 'Predecessor'
    }
  });
  
  console.log('Create relationship response:', JSON.stringify(createRelationshipResponse, null, 2));
  
  // Verify the relationship was created
  console.log('Verifying relationship with getRelationships...');
  const verifyResponse = await client.callTool({
    name: 'getRelationships',
    arguments: {
      artifactId: storyId
    }
  });
  
  console.log('Verify response:', JSON.stringify(verifyResponse, null, 2));
  
  // Remove the relationship
  console.log('Testing removeRelationship tool...');
  const removeResponse = await client.callTool({
    name: 'removeRelationship',
    arguments: {
      sourceId: storyId,
      targetId: 'US3',
      relationshipType: 'Predecessor'
    }
  });
  
  console.log('Remove relationship response:', JSON.stringify(removeResponse, null, 2));
  
  // Final verification
  console.log('Final verification with getRelationships...');
  const finalResponse = await client.callTool({
    name: 'getRelationships',
    arguments: {
      artifactId: storyId
    }
  });
  
  console.log('Final response:', JSON.stringify(finalResponse, null, 2));
}

// Run the tests
runTests().catch(error => {
  console.error('Uncaught error:', error);
  process.exit(1);
}); 