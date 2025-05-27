/**
 * Simple Server Test
 * 
 * This script tests if the MCP server is running and responding to HTTP requests
 * without using the complex MCP client.
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

// Configuration
const SERVER_PORT = 3000;
const SERVER_TIMEOUT = 20000;

// Start the server
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
    let output = '';
    let actualPort = SERVER_PORT;
    
    serverProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log(`[SERVER]: ${chunk.trim()}`);
      
      // Check if server started and detect the actual port it's using
      if (chunk.includes('HTTP server listening on')) {
        console.log('Server started successfully.');
        serverStarted = true;
        
        // Extract the actual port from the server output
        const portMatch = chunk.match(/HTTP server listening on .+:(\d+)/);
        if (portMatch && portMatch[1]) {
          actualPort = parseInt(portMatch[1], 10);
          console.log(`Server is using port ${actualPort}`);
        }
        
        // Give it a moment to fully initialize
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

// Test HTTP connection to server
async function testServerConnection(port) {
  return new Promise((resolve, reject) => {
    console.log(`Testing HTTP connection to server at http://127.0.0.1:${port}/health...`);
    
    const request = http.get({
      hostname: '127.0.0.1',
      port: port,
      path: '/health',
      timeout: 5000
    }, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        console.log(`Server responded with status: ${response.statusCode}`);
        console.log('Response data:', data);
        resolve(true);
      });
    });
    
    request.on('error', (error) => {
      console.error('Error connecting to server:', error.message);
      reject(error);
    });
    
    request.on('timeout', () => {
      console.error('Connection timed out');
      request.destroy();
      reject(new Error('Connection timeout'));
    });
  });
}

// Test direct socket connection to server
async function testSocketConnection(port) {
  return new Promise((resolve, reject) => {
    console.log(`Testing direct socket connection to server at 127.0.0.1:${port}...`);
    
    const net = require('net');
    const socket = new net.Socket();
    
    socket.setTimeout(5000);
    
    socket.on('connect', () => {
      console.log('Socket connection successful!');
      socket.destroy();
      resolve(true);
    });
    
    socket.on('error', (error) => {
      console.error('Socket connection error:', error.message);
      socket.destroy();
      reject(error);
    });
    
    socket.on('timeout', () => {
      console.error('Socket connection timed out');
      socket.destroy();
      reject(new Error('Socket connection timeout'));
    });
    
    socket.connect(port, '127.0.0.1');
  });
}

// Test MCP connection to server
async function testMcpConnection(port) {
  return new Promise(async (resolve, reject) => {
    console.log(`Testing MCP connection to server at http://127.0.0.1:${port}/mcp...`);
    
    try {
      const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
      const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
      
      // Create client with extra debug info
      const client = new Client({
        name: 'simple-test-client',
        version: '1.0.0'
      });
      
      // Connect to local server
      const transport = new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/mcp`)
      );
      
      // Set a timeout for the connection attempt
      const timeoutId = setTimeout(() => {
        reject(new Error('MCP connection timeout'));
      }, 10000);
      
      try {
        await client.connect(transport);
        clearTimeout(timeoutId);
        console.log('MCP client connected successfully!');
        
        // Try listing resources
        const resources = await client.listResources();
        console.log('Available resources:', JSON.stringify(resources, null, 2));
        
        transport.close();
        resolve(true);
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('MCP client connection error:', error);
        
        if (error.cause) {
          console.error('Cause:', error.cause);
        }
        
        reject(error);
      }
    } catch (error) {
      console.error('Error setting up MCP client:', error);
      reject(error);
    }
  });
}

// Main function
async function runTest() {
  let serverProcess, port;
  
  try {
    console.log('\n=== STARTING SIMPLE SERVER TEST ===\n');
    
    // Start the server
    const serverInfo = await startServer();
    serverProcess = serverInfo.serverProcess;
    port = serverInfo.port;
    
    console.log(`Server started on port: ${port}`);
    
    // Wait a moment for the server to fully initialize
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test HTTP connection
    await testServerConnection(port);
    
    // Test socket connection
    await testSocketConnection(port);
    
    // Test MCP connection
    await testMcpConnection(port);
    
    console.log('\n=== SIMPLE SERVER TEST COMPLETED SUCCESSFULLY ===\n');
  } catch (error) {
    console.error('\n=== SIMPLE SERVER TEST FAILED ===\n');
    console.error('Error:', error.message);
  } finally {
    // Clean up
    if (serverProcess) {
      console.log('Stopping server...');
      serverProcess.kill();
      console.log('Server stopped.');
    }
  }
}

// Run the test
runTest(); 