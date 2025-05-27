// Test MCP client connecting to our server
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

// Configuration
const SERVER_PORT = 3000;
const SERVER_TIMEOUT = 20000;

// Function to detect if a port is in use
async function isPortUsed(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const tester = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        tester.close();
        resolve(false);
      })
      .listen(port, '127.0.0.1');
  });
}

// Function to start the server and detect the actual port
async function startServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting MCP Rally server...');
    
    const serverProcess = spawn('node', [
      'dist/index.js',
      '--http',
      '--port', SERVER_PORT.toString(),
      '--hostname', '127.0.0.1'
    ], {
      cwd: path.join(__dirname, '..'),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let serverStarted = false;
    let actualPort = SERVER_PORT;
    
    serverProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      console.log(`[SERVER]: ${chunk.trim()}`);
      
      // Detect when server starts and what port it's using
      if (chunk.includes('HTTP server listening on')) {
        console.log('Server started successfully.');
        serverStarted = true;
        
        // Extract the actual port from the server output
        const portMatch = chunk.match(/HTTP server listening on .+:(\d+)/);
        if (portMatch && portMatch[1]) {
          actualPort = parseInt(portMatch[1], 10);
          console.log(`Server is using port ${actualPort}`);
        }
        
        // Wait a moment for the server to fully initialize
        setTimeout(() => {
          resolve({ serverProcess, port: actualPort });
        }, 2000);
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      console.error(`[SERVER ERROR]: ${chunk.trim()}`);
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

// Check if server health endpoint is accessible
async function checkServerHealth(port) {
  return new Promise((resolve, reject) => {
    console.log(`Checking server health at http://127.0.0.1:${port}/health...`);
    
    const request = http.get({
      hostname: '127.0.0.1',
      port: port,
      path: '/health',
      timeout: 5000
    }, (response) => {
      if (response.statusCode === 200) {
        console.log('Server health check passed.');
        resolve(true);
      } else {
        console.log(`Server responded with unexpected status: ${response.statusCode}`);
        resolve(false);
      }
    });
    
    request.on('error', (error) => {
      console.error('Health check error:', error.message);
      resolve(false);
    });
    
    request.on('timeout', () => {
      console.error('Health check timed out');
      request.destroy();
      resolve(false);
    });
  });
}

async function main() {
  let serverProcess;
  let port = SERVER_PORT;

  try {
    // Check if the server is already running
    const portInUse = await isPortUsed(SERVER_PORT);
    
    if (portInUse) {
      console.log(`Port ${SERVER_PORT} is already in use. Assuming server is running.`);
      
      // Check if the server is responding to health checks
      const isHealthy = await checkServerHealth(SERVER_PORT);
      if (!isHealthy) {
        console.error('Existing server is not responding to health checks.');
        process.exit(1);
      }
    } else {
      // Start the server
      const serverInfo = await startServer();
      serverProcess = serverInfo.serverProcess;
      port = serverInfo.port;
      
      // Wait for server to fully initialize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Verify server is healthy
      const isHealthy = await checkServerHealth(port);
      if (!isHealthy) {
        throw new Error('Server is not responding to health checks after startup.');
      }
    }
    
    console.log('Initializing MCP client...');
    
    // Create client
    const client = new Client({
      name: 'test-client',
      version: '1.0.0'
    });
    
    // Connect to local server with detected port
    console.log(`Connecting to MCP server at http://127.0.0.1:${port}/mcp...`);
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/mcp`)
    );
    
    // Set connection timeout
    const connectionPromise = client.connect(transport);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout')), 10000)
    );
    
    await Promise.race([connectionPromise, timeoutPromise]);
    console.log('Connected successfully!');
    
    // List resources
    console.log('Listing resources...');
    const resources = await client.listResources();
    console.log('Available resources:', JSON.stringify(resources, null, 2));
    
    // Test the test resource
    console.log('\nTesting test resource...');
    try {
      const testResult = await client.readResource({
        uri: 'rally://test'
      });
      console.log('Test resource result:', JSON.stringify(testResult, null, 2));
    } catch (error) {
      console.error('Error reading test resource:', error);
    }
    
    // Test stories resource without parameters
    console.log('\nTesting stories resource...');
    try {
      const storiesResult = await client.readResource({
        uri: 'rally://stories'
      });
      console.log(`Got ${storiesResult.contents?.length || 0} stories`);
      if (storiesResult.contents && storiesResult.contents.length > 0) {
        console.log('First story:', JSON.parse(storiesResult.contents[0].text).Name);
      }
    } catch (error) {
      console.error('Error reading stories:', error);
    }
    
    // Test stories resource with parameters
    console.log('\nTesting stories resource with parameters...');
    try {
      const storiesWithParams = await client.readResource({
        uri: 'rally://stories?pageSize=5'
      });
      console.log(`Got ${storiesWithParams.contents?.length || 0} stories with parameters`);
      if (storiesWithParams.contents && storiesWithParams.contents.length > 0) {
        console.log('First story with params:', JSON.parse(storiesWithParams.contents[0].text).Name);
      }
    } catch (error) {
      console.error('Error reading stories with parameters:', error);
    }
    
    // Clean up
    console.log('\nTest completed, disconnecting...');
    transport.close();
    
  } catch (error) {
    console.error('Test failed:', error);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  } finally {
    // Clean up
    if (serverProcess) {
      console.log('Stopping server...');
      try {
        serverProcess.kill();
        console.log('Server stopped.');
      } catch (e) {
        console.log('Error stopping server:', e.message);
      }
    }
  }
}

// Run the test
main(); 