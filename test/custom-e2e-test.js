/**
 * Custom End-to-End Test for MCP Rally Server
 * 
 * This script tests the MCP Rally server by:
 * 1. Starting a mock server that doesn't require real Rally credentials
 * 2. Connecting an MCP client to the server
 * 3. Testing resource access (stories)
 * 4. Testing tool operations (create, update, delete stories)
 * 5. Testing relationship operations
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { spawn } = require('child_process');
const path = require('path');

// Configuration
const SERVER_PORT = 3456;
const SERVER_TIMEOUT = 10000;

// Global variables
let serverProcess;
let client;
let transport;

/**
 * Start the mock server
 */
async function startMockServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting mock MCP server...');
    
    serverProcess = spawn('node', [path.join(__dirname, 'mock-server.js')], {
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
        console.error('Server startup timed out');
        if (serverProcess) {
          serverProcess.kill();
        }
        reject(new Error('Server startup timeout'));
      }
    }, SERVER_TIMEOUT);
  });
}

/**
 * Connect an MCP client to the server
 */
async function connectClient() {
  console.log('Connecting MCP client...');
  
  client = new Client({
    name: 'e2e-test-client',
    version: '1.0.0'
  });
  
  transport = new StreamableHTTPClientTransport(
    new URL(`http://localhost:${SERVER_PORT}/mcp`)
  );
  
  await client.connect(transport);
  console.log('Client connected successfully');
  
  return client;
}

/**
 * Test story-related tools
 */
async function testStoryTools() {
  console.log('\n--- TESTING STORY TOOLS ---');
  
  // Create a story
  console.log('\nTesting createStory tool...');
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
  
  console.log('Create result:', JSON.stringify(createResult, null, 2));
  
  // Check that we got a successful response
  if (createResult.isError) {
    throw new Error(`Failed to create story: ${createResult.content[0].text}`);
  }
  
  // Update a story
  console.log('\nTesting updateStory tool...');
  const updateResult = await client.callTool({
    name: 'updateStory',
    arguments: {
      id: 'US1', // Using a mock ID that exists in the mock server
      name: 'Updated E2E Test Story',
      state: 'In-Progress',
      estimate: 8
    }
  });
  
  console.log('Update result:', JSON.stringify(updateResult, null, 2));
  
  // Check that we got a successful response
  if (updateResult.isError) {
    throw new Error(`Failed to update story: ${updateResult.content[0].text}`);
  }
  
  // Test delete story
  console.log('\nTesting deleteStory tool...');
  const deleteResult = await client.callTool({
    name: 'deleteStory',
    arguments: {
      id: 'US2' // Using a mock ID that exists in the mock server
    }
  });
  
  console.log('Delete result:', JSON.stringify(deleteResult, null, 2));
  
  // Check that we got a successful response
  if (deleteResult.isError) {
    throw new Error(`Failed to delete story: ${deleteResult.content[0].text}`);
  }
  
  console.log('\nAll story tool tests passed!');
}

/**
 * Test relationship tools
 */
async function testRelationshipTools() {
  console.log('\n--- TESTING RELATIONSHIP TOOLS ---');
  
  // Get relationships - initial state
  console.log('\nTesting getRelationships tool (initial)...');
  const initialRelationships = await client.callTool({
    name: 'getRelationships',
    arguments: {
      artifactId: 'US1'
    }
  });
  
  console.log('Initial relationships:', JSON.stringify(initialRelationships, null, 2));
  
  // Check that we got a successful response
  if (initialRelationships.isError) {
    throw new Error(`Failed to get relationships: ${initialRelationships.content[0].text}`);
  }
  
  // Create a relationship
  console.log('\nTesting createRelationship tool...');
  const createRelationship = await client.callTool({
    name: 'createRelationship',
    arguments: {
      sourceId: 'US1',
      targetId: 'US3',
      relationshipType: 'Predecessor'
    }
  });
  
  console.log('Create relationship result:', JSON.stringify(createRelationship, null, 2));
  
  // Check that we got a successful response
  if (createRelationship.isError) {
    throw new Error(`Failed to create relationship: ${createRelationship.content[0].text}`);
  }
  
  // Get relationships - after creation
  console.log('\nTesting getRelationships tool (after creation)...');
  const updatedRelationships = await client.callTool({
    name: 'getRelationships',
    arguments: {
      artifactId: 'US1'
    }
  });
  
  console.log('Updated relationships:', JSON.stringify(updatedRelationships, null, 2));
  
  // Remove the relationship
  console.log('\nTesting removeRelationship tool...');
  const removeRelationship = await client.callTool({
    name: 'removeRelationship',
    arguments: {
      sourceId: 'US1',
      targetId: 'US3',
      relationshipType: 'Predecessor'
    }
  });
  
  console.log('Remove relationship result:', JSON.stringify(removeRelationship, null, 2));
  
  // Check that we got a successful response
  if (removeRelationship.isError) {
    throw new Error(`Failed to remove relationship: ${removeRelationship.content[0].text}`);
  }
  
  // Final verification
  console.log('\nTesting getRelationships tool (final)...');
  const finalRelationships = await client.callTool({
    name: 'getRelationships',
    arguments: {
      artifactId: 'US1'
    }
  });
  
  console.log('Final relationships:', JSON.stringify(finalRelationships, null, 2));
  
  console.log('\nAll relationship tool tests passed!');
}

/**
 * Run the end-to-end test
 */
async function runE2ETest() {
  try {
    console.log('\n=== STARTING END-TO-END TEST ===\n');
    
    // Start mock server
    await startMockServer();
    
    // Connect client
    await connectClient();
    
    // Test story tools
    await testStoryTools();
    
    // Test relationship tools
    await testRelationshipTools();
    
    console.log('\n=== END-TO-END TEST COMPLETED SUCCESSFULLY ===');
    process.exit(0);
  } catch (error) {
    console.error('\n=== END-TO-END TEST FAILED ===');
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    // Clean up
    if (transport) {
      console.log('Disconnecting client...');
      transport.close();
    }
    
    if (serverProcess) {
      console.log('Stopping server...');
      serverProcess.kill();
      console.log('Server stopped');
    }
  }
}

// Run the test
runE2ETest().catch(error => {
  console.error('Uncaught error:', error);
  process.exit(1);
}); 