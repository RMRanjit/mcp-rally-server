// Test MCP client for relationship tools
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { spawn } = require('child_process');
const path = require('path');

async function startServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting MCP server for test...');
    
    // Use mock-server.js for testing
    const serverProcess = spawn('node', [path.join(__dirname, 'mock-server.js')], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: '3456',
        NODE_ENV: 'test'
      }
    });
    
    let serverStarted = false;
    let errorOutput = '';
    
    serverProcess.stdout.on('data', (chunk) => {
      const output = chunk.toString();
      console.log(`[SERVER]: ${output.trim()}`);
      
      if (output.includes('HTTP server listening on port')) {
        console.log('Server started successfully.');
        // Give it a moment to fully initialize
        setTimeout(() => {
          serverStarted = true;
          resolve(serverProcess);
        }, 1000);
      }
    });
    
    serverProcess.stderr.on('data', (chunk) => {
      const output = chunk.toString();
      console.error(`[SERVER ERROR]: ${output.trim()}`);
      errorOutput += output;
    });
    
    serverProcess.on('error', (err) => {
      console.error('Failed to start server:', err);
      reject(err);
    });
    
    serverProcess.on('exit', (code, signal) => {
      if (!serverStarted) {
        console.error(`Server process exited unexpectedly with code ${code} and signal ${signal}`);
        reject(new Error(`Server failed to start: ${errorOutput}`));
      }
    });
    
    // Set a timeout in case server doesn't start
    setTimeout(() => {
      if (!serverStarted) {
        serverProcess.kill();
        reject(new Error(`Server failed to start within timeout: ${errorOutput}`));
      }
    }, 10000);
  });
}

async function runTests() {
  let serverProcess;
  let client;
  let transport;
  
  try {
    // Start the test server
    serverProcess = await startServer();
    
    console.log('Initializing MCP client...');
    
    // Create client
    client = new Client({
      name: 'relationship-test-client',
      version: '1.0.0'
    });
    
    // Connect to test server
    console.log('Connecting to MCP server...');
    transport = new StreamableHTTPClientTransport(
      new URL('http://localhost:3456/mcp')
    );
    
    await client.connect(transport);
    console.log('Connected successfully!');
    
    // List available tools
    console.log('Listing available tools...');
    const tools = await client.listTools();
    console.log('Available tools:', tools);
    
    // If we have the tools we need, proceed with testing
    if (tools && tools.some(tool => tool.name === 'getRelationships')) {
      console.log('\n--- TESTING GET RELATIONSHIPS ---');
      try {
        const getResult = await client.callTool({
          name: 'getRelationships',
          arguments: {
            artifactId: 'US1'
          }
        });
        
        console.log('Get relationships result:', JSON.stringify(getResult, null, 2));
        
        // Test createRelationship only if getRelationships was successful
        console.log('\n--- TESTING CREATE RELATIONSHIP ---');
        const createResult = await client.callTool({
          name: 'createRelationship',
          arguments: {
            sourceId: 'US1',
            targetId: 'US3',
            relationshipType: 'Predecessor'
          }
        });
        
        console.log('Create relationship result:', JSON.stringify(createResult, null, 2));
        
        console.log('\n=== TESTS PASSED ===');
        return true;
      } catch (error) {
        console.error('Error executing tool:', error);
        throw error;
      }
    } else {
      console.error('Required tools not available on server.');
      console.log('Available tools:', tools);
      throw new Error('Required tools not available');
    }
  } catch (error) {
    console.error('\n=== TEST FAILED ===');
    console.error('Error:', error.message);
    return false;
  } finally {
    // Clean up
    console.log('\nCleaning up...');
    
    if (transport && typeof transport.close === 'function') {
      transport.close();
      console.log('Transport closed.');
    }
    
    if (serverProcess) {
      console.log('Shutting down test server...');
      serverProcess.kill();
      console.log('Server shut down.');
    }
  }
}

// Run the tests and exit with appropriate code
runTests()
  .then(success => {
    console.log(`\nExiting with ${success ? 'success' : 'failure'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 