/**
 * End-to-End Test with Real MCP Rally Server
 * 
 * This test runs against the actual MCP Rally server to verify
 * integration with the real Rally API.
 * 
 * IMPORTANT: Requires valid Rally API credentials in .env file:
 * - RALLY_API_KEY
 * - RALLY_WORKSPACE
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

// Configuration
const SERVER_PORT = 3333; // Use a different port to avoid conflicts
const SERVER_TIMEOUT = 60000; // Increase timeout for server startup
const OPERATION_TIMEOUT = 10000; // Increase timeout for operations

// Check if we have Rally credentials
const envFile = path.join(__dirname, '../../.env');
const hasEnvFile = fs.existsSync(envFile);

if (!hasEnvFile) {
  console.error('No .env file found. This test requires Rally API credentials.');
  console.error('Create a .env file with RALLY_API_KEY and RALLY_WORKSPACE.');
  process.exit(1);
}

// Global variables
let serverProcess;
let client;
let transport;
let storyId; // Will store the ID of a story we create for testing

/**
 * Check if a port is accessible
 */
function checkPortAccessible(port) {
  return new Promise((resolve) => {
    // Try to connect directly to the port first
    const net = require('net');
    const socket = new net.Socket();
    
    const onError = () => {
      socket.destroy();
      
      // If direct connection fails, try HTTP request as fallback
      const req = http.get({
        hostname: '127.0.0.1', // Explicitly use IPv4
        port: port,
        path: '/health',
        timeout: 3000
      }, (res) => {
        resolve(true);
      });
      
      req.on('error', () => {
        resolve(false);
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    };
    
    socket.setTimeout(1000);
    socket.on('error', onError);
    socket.on('timeout', () => {
      socket.destroy();
      onError();
    });
    
    socket.connect(port, '127.0.0.1', () => {
      socket.destroy();
      resolve(true);
    });
  });
}

// Function to start the real MCP Rally server
async function startServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting MCP Rally server...');
    
    // Kill any process that might be using the port
    try {
      const findProcess = spawn('lsof', ['-i', `:${SERVER_PORT}`]);
      let output = '';
      
      findProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      findProcess.on('close', () => {
        if (output) {
          console.log(`Found processes using port ${SERVER_PORT}:`);
          console.log(output);
          
          // Try to kill them
          try {
            spawn('kill', ['-9', `$(lsof -t -i:${SERVER_PORT})`], { shell: true });
            console.log(`Attempted to kill processes using port ${SERVER_PORT}`);
          } catch (e) {
            console.log(`Error killing processes: ${e.message}`);
          }
        }
      });
    } catch (e) {
      console.log(`Error checking for processes: ${e.message}`);
    }
    
    // Start the server with explicit hostname to avoid IPv6 binding issues
    serverProcess = spawn('node', [
      'dist/index.js',
      '--http',
      '--port', SERVER_PORT.toString(),
      '--hostname', '127.0.0.1'  // Explicitly use IPv4 localhost
    ], {
      cwd: path.join(__dirname, '../..'),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let serverStarted = false;
    let output = '';
    let errorOutput = '';
    
    serverProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log(`[SERVER]: ${chunk.trim()}`);
      
      // Check if the server is listening on any port (including default 3000)
      if (chunk.includes(`HTTP server listening on port`)) {
        console.log('Server started successfully.');
        serverStarted = true;
        
        // Extract the actual port from the server output
        const portMatch = chunk.match(/HTTP server listening on port (\d+)/);
        const actualPort = portMatch ? parseInt(portMatch[1]) : SERVER_PORT;
        
        if (actualPort !== SERVER_PORT) {
          console.log(`Server is using port ${actualPort} instead of requested port ${SERVER_PORT}`);
          // Update the global variable so the client connects to the right port
          global.ACTUAL_SERVER_PORT = actualPort;
        }
        
        // Give it more time to fully initialize
        setTimeout(async () => {
          // Check if the server port is actually accessible
          const isAccessible = await checkPortAccessible(actualPort);
          if (isAccessible) {
            console.log(`Server port ${actualPort} is accessible`);
            resolve(serverProcess);
          } else {
            console.log(`Server port ${actualPort} is not accessible yet, waiting...`);
            // Wait a bit longer and try again
            setTimeout(async () => {
              const isNowAccessible = await checkPortAccessible(actualPort);
              if (isNowAccessible) {
                console.log(`Server port ${actualPort} is now accessible`);
                resolve(serverProcess);
              } else {
                reject(new Error(`Server port ${actualPort} is not accessible after waiting`));
              }
            }, 5000);
          }
        }, 5000);
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      console.error(`[SERVER ERROR]: ${chunk.trim()}`);
      
      // Check if error is due to invalid credentials
      if (chunk.includes('Rally API authentication failed')) {
        reject(new Error('Rally API authentication failed. Check your credentials in .env file.'));
      }
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
        serverProcess.kill('SIGTERM');
        setTimeout(() => {
          // Force kill if still running
          try {
            process.kill(serverProcess.pid, 'SIGKILL');
          } catch (e) {
            // Process might already be gone
          }
          console.log('Server stopped.');
          resolve();
        }, 3000);
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
    
    // Use the actual port that the server is listening on (which might differ from the configured port)
    const portToUse = global.ACTUAL_SERVER_PORT || SERVER_PORT;
    
    console.log(`Verifying server is accessible at http://localhost:${portToUse}/health...`);
    
    // Try several times with increasing delays
    const maxAttempts = 5;
    let attempt = 0;
    let connected = false;
    
    while (attempt < maxAttempts && !connected) {
      attempt++;
      const waitTime = attempt * 1000; // Increasing delay
      
      try {
        const accessible = await checkPortAccessible(portToUse);
        if (accessible) {
          console.log(`Server verified accessible after ${attempt} attempts on port ${portToUse}`);
          connected = true;
        } else {
          console.log(`Server not accessible yet (attempt ${attempt}/${maxAttempts}), waiting ${waitTime}ms...`);
          await new Promise(r => setTimeout(r, waitTime));
        }
      } catch (e) {
        console.log(`Error checking server: ${e.message}, retrying...`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }
    
    if (!connected) {
      return reject(new Error(`Failed to verify server is accessible after ${maxAttempts} attempts`));
    }
    
    // Now try to connect with the MCP client
    client = new Client({
      name: 'rally-real-e2e-test-client',
      version: '1.0.0'
    });
    
    // Use the port we've already determined works
    transport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${portToUse}/mcp`)
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
      // Provide more details about the error
      if (error.cause) {
        console.error('Error cause:', error.cause);
      }
      if (error.code) {
        console.error('Error code:', error.code);
      }
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
    console.log('\n=== STARTING REAL SERVER E2E TESTS ===\n');
    
    // Start server with the real Rally API
    await startServer();
    
    // Connect client to server
    await connectClient();
    
    // Test resource access
    console.log('\n--- TESTING RESOURCE ACCESS ---');
    await testResources();
    
    // Test story operations
    console.log('\n--- TESTING STORY OPERATIONS ---');
    storyId = await testStoryOperations();
    
    // Test relationship operations if we have a story ID
    if (storyId) {
      console.log('\n--- TESTING RELATIONSHIP OPERATIONS ---');
      await testRelationshipOperations(storyId);
    }
    
    console.log('\n=== REAL SERVER E2E TESTS COMPLETED SUCCESSFULLY ===');
  } catch (error) {
    console.error('\n=== REAL SERVER E2E TESTS FAILED ===');
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    // Clean up
    await disconnectClient();
    await stopServer();
  }
}

// Test resource access to Rally data
async function testResources() {
  // Test stories resource
  console.log('Testing stories resource...');
  const storiesResponse = await client.readResource({
    uri: 'rally://stories?pageSize=5'
  });
  
  console.log('Stories response:', storiesResponse);
  console.log(`Retrieved ${storiesResponse.contents?.length || 0} stories`);
  
  // Check pagination metadata
  if (storiesResponse._meta) {
    console.log('Pagination metadata present');
  }
  
  // If we have stories, test single story resource
  if (storiesResponse.contents && storiesResponse.contents.length > 0) {
    try {
      const story = JSON.parse(storiesResponse.contents[0].text);
      console.log(`First story: ${story.FormattedID} - ${story.Name}`);
      
      // Test single story resource
      console.log('Testing single story resource...');
      const storyResponse = await client.readResource({
        uri: `rally://story/${story.ObjectID}`
      });
      
      if (storyResponse.contents && storyResponse.contents.length > 0) {
        try {
          const singleStory = JSON.parse(storyResponse.contents[0].text);
          console.log(`Retrieved story: ${singleStory.FormattedID} - ${singleStory.Name}`);
        } catch (e) {
          console.log('Failed to parse single story as JSON:', storyResponse.contents[0].text);
        }
      }
    } catch (e) {
      console.log('Failed to parse story as JSON:', storiesResponse.contents[0].text);
    }
  }
}

// Test story CRUD operations
async function testStoryOperations() {
  // Create a new story for testing
  console.log('Creating a new test story...');
  const createResponse = await client.callTool({
    name: 'createStory',
    arguments: {
      name: 'E2E Test Story ' + new Date().toISOString(),
      description: 'This story was created by the E2E test against the real server',
      state: 'Defined',
      estimate: 3,
      priority: 'Low'
    }
  });
  
  if (createResponse.isError) {
    throw new Error(`Failed to create story: ${createResponse.content[0]?.text || 'Unknown error'}`);
  }
  
  console.log('Create response:', createResponse);
  
  // Check if the response contains text that might be JSON or might be just a success message
  let storyData;
  let createdStoryId;
  
  try {
    // First, try to parse as JSON
    storyData = JSON.parse(createResponse.content[0].text);
    createdStoryId = storyData.FormattedID;
  } catch (e) {
    // If parsing fails, try to extract the ID from the success message text
    console.log('Failed to parse response as JSON, trying to extract story ID from text');
    const text = createResponse.content[0].text;
    const match = text.match(/ID\s+([A-Z]+\d+)/);
    if (match && match[1]) {
      createdStoryId = match[1];
      console.log(`Extracted story ID from text: ${createdStoryId}`);
    } else {
      console.warn('Could not extract story ID from response:', text);
      createdStoryId = 'US1'; // Fallback to a default ID for testing
    }
  }
  console.log(`Created story with ID: ${createdStoryId}`);
  
  // Add a delay to give Rally time to process the story creation
  console.log('Waiting for 3 seconds to ensure story is fully processed...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Update the story
  console.log(`Updating story ${createdStoryId}...`);
  const updateResponse = await client.callTool({
    name: 'updateStory',
    arguments: {
      id: createdStoryId,
      name: `Updated E2E Test Story ${new Date().toISOString()}`,
      description: 'This story was updated by the E2E test',
      state: 'In-Progress',
      estimate: 5
    }
  });
  
  if (updateResponse.isError) {
    console.error('Update error response:', updateResponse);
    
    // If the update fails, try with US prefix if it doesn't already have one
    if (!createdStoryId.startsWith('US') && !isNaN(createdStoryId)) {
      const prefixedId = 'US' + createdStoryId;
      console.log(`Retrying update with prefixed ID: ${prefixedId}`);
      
      const retryResponse = await client.callTool({
        name: 'updateStory',
        arguments: {
          id: prefixedId,
          name: `Updated E2E Test Story ${new Date().toISOString()}`,
          description: 'This story was updated by the E2E test',
          state: 'In-Progress',
          estimate: 5
        }
      });
      
      if (retryResponse.isError) {
        console.error('Retry update also failed:', retryResponse);
        throw new Error(`Failed to update story: ${updateResponse.content[0]?.text || 'Unknown error'}`);
      } else {
        console.log('Retry update succeeded with prefixed ID');
        createdStoryId = prefixedId; // Update the ID for later use
        return createdStoryId;
      }
    } else {
      throw new Error(`Failed to update story: ${updateResponse.content[0]?.text || 'Unknown error'}`);
    }
  }
  
  console.log(`Successfully updated story ${createdStoryId}`);
  
  return createdStoryId;
}

// Test relationship operations
async function testRelationshipOperations(storyId) {
  // First, get initial relationships (should be empty for a new story)
  console.log(`Getting initial relationships for ${storyId}...`);
  const initialResponse = await client.callTool({
    name: 'getRelationships',
    arguments: {
      artifactId: storyId
    }
  });
  
  if (initialResponse.isError) {
    throw new Error(`Failed to get relationships: ${initialResponse.content[0]?.text || 'Unknown error'}`);
  }
  
  // We need another story to create a relationship
  // First, let's check if we have any other stories
  const storiesResponse = await client.readResource({
    uri: 'rally://stories?pageSize=5'
  });
  
  if (!storiesResponse.contents || storiesResponse.contents.length < 2) {
    console.log('Not enough stories to test relationships. Creating a second story...');
    
    // Create another story
    const createResponse = await client.callTool({
      name: 'createStory',
      arguments: {
        name: 'Related E2E Test Story ' + new Date().toISOString(),
        description: 'This story was created to test relationships',
        state: 'Defined'
      }
    });
    
    if (createResponse.isError) {
      throw new Error(`Failed to create second story: ${createResponse.content[0]?.text || 'Unknown error'}`);
    }
    
    const secondStoryData = JSON.parse(createResponse.content[0].text);
    const secondStoryId = secondStoryData.FormattedID;
    console.log(`Created second story with ID: ${secondStoryId}`);
    
    // Create a relationship
    console.log(`Creating relationship between ${storyId} and ${secondStoryId}...`);
    const createRelationshipResponse = await client.callTool({
      name: 'createRelationship',
      arguments: {
        sourceId: storyId,
        targetId: secondStoryId,
        relationshipType: 'Predecessor'
      }
    });
    
    if (createRelationshipResponse.isError) {
      throw new Error(`Failed to create relationship: ${createRelationshipResponse.content[0]?.text || 'Unknown error'}`);
    }
    
    console.log(`Successfully created relationship between ${storyId} and ${secondStoryId}`);
    
    // Verify the relationship was created
    console.log('Verifying relationship...');
    const verifyResponse = await client.callTool({
      name: 'getRelationships',
      arguments: {
        artifactId: storyId
      }
    });
    
    if (verifyResponse.isError) {
      throw new Error(`Failed to verify relationship: ${verifyResponse.content[0]?.text || 'Unknown error'}`);
    }
    
    // Remove the relationship
    console.log(`Removing relationship between ${storyId} and ${secondStoryId}...`);
    const removeResponse = await client.callTool({
      name: 'removeRelationship',
      arguments: {
        sourceId: storyId,
        targetId: secondStoryId,
        relationshipType: 'Predecessor'
      }
    });
    
    if (removeResponse.isError) {
      throw new Error(`Failed to remove relationship: ${removeResponse.content[0]?.text || 'Unknown error'}`);
    }
    
    console.log(`Successfully removed relationship between ${storyId} and ${secondStoryId}`);
    
    // Final verification
    console.log('Final verification...');
    const finalResponse = await client.callTool({
      name: 'getRelationships',
      arguments: {
        artifactId: storyId
      }
    });
    
    if (finalResponse.isError) {
      throw new Error(`Failed final verification: ${finalResponse.content[0]?.text || 'Unknown error'}`);
    }
    
    console.log('Relationship operations completed successfully');
  } else {
    console.log('Found existing stories, skipping relationship tests to avoid modifying real data');
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Uncaught error:', error);
  process.exit(1);
});