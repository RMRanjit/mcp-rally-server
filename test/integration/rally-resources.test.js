// Integration test for Rally resources
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Use a shorter timeout to avoid hanging
const SERVER_TIMEOUT = 10000; // 10 seconds
const OPERATION_TIMEOUT = 5000; // 5 seconds for each operation

// Instead of exiting, we'll run with mock data if no real credentials
const envFile = path.join(__dirname, '../../.env');
const hasRealCredentials = fs.existsSync(envFile) && 
  fs.readFileSync(envFile, 'utf8').indexOf('RALLY_API_KEY=test-api-key') === -1;

console.log('Using real credentials:', hasRealCredentials ? 'YES' : 'NO');

let serverProcess;
let client;
let transport;

async function startServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting MCP server...');
    serverProcess = spawn('node', ['dist/index.js', '--http'], {
      cwd: path.join(__dirname, '../..'),
      env: process.env
    });
    
    let output = '';
    let errorOutput = '';
    
    serverProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      process.stdout.write(`[SERVER]: ${chunk}`);
      
      if (chunk.includes('HTTP server listening on port')) {
        console.log('Server started successfully.');
        // Give it a moment to fully initialize
        setTimeout(resolve, 1000);
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      process.stderr.write(`[SERVER ERROR]: ${chunk}`);
      
      if (chunk.includes('HTTP server listening on port')) {
        console.log('Server started successfully (from stderr).');
        // Give it a moment to fully initialize
        setTimeout(resolve, 1000);
      }
    });
    
    serverProcess.on('error', (err) => {
      console.error('Failed to start server:', err);
      reject(err);
    });
    
    serverProcess.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Server process exited with code ${code}`);
        reject(new Error(`Server exited with code ${code}`));
      }
    });
    
    // Timeout if server doesn't start properly
    setTimeout(() => {
      if (!output.includes('HTTP server listening on port') && 
          !errorOutput.includes('HTTP server listening on port')) {
        console.error('Server startup timed out. Output:', output, 'Error output:', errorOutput);
        if (serverProcess) {
          serverProcess.kill('SIGKILL');
        }
        reject(new Error('Server startup timeout'));
      }
    }, SERVER_TIMEOUT);
  });
}

async function stopServer() {
  return new Promise((resolve) => {
    if (serverProcess) {
      console.log('Stopping server...');
      serverProcess.on('exit', () => {
        console.log('Server stopped.');
        resolve();
      });
      
      serverProcess.kill();
      
      // Force kill after timeout
      setTimeout(() => {
        try {
          process.kill(serverProcess.pid, 'SIGKILL');
        } catch (e) {
          // Process might already be gone
        }
        resolve();
      }, 3000);
    } else {
      resolve();
    }
  });
}

async function connectClient() {
  return new Promise(async (resolve, reject) => {
    console.log('Connecting MCP client...');
    client = new Client({
      name: 'rally-test-client',
      version: '1.0.0'
    });
    
    transport = new StreamableHTTPClientTransport(
      new URL('http://localhost:3000/mcp')
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

async function disconnectClient() {
  if (transport) {
    console.log('Disconnecting client...');
    transport.close();
  }
}

async function testWithTimeout(operation, timeoutMs = OPERATION_TIMEOUT) {
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

async function testStories() {
  console.log('Testing stories resource...');
  
  return testWithTimeout(async () => {
    try {
      const response = await client.readResource({
        uri: 'rally://stories'
      });
      
      console.log(`Received ${response.contents?.length || 0} stories`);
      if (response.contents && response.contents.length > 0) {
        const firstStory = JSON.parse(response.contents[0].text);
        console.log('First story:', firstStory.Name || '[No name]');
      }
      
      return response;
    } catch (error) {
      console.error('Error reading stories:', error);
      throw error;
    }
  });
}

async function testFilteredStories() {
  console.log('Testing filtered stories...');
  
  return testWithTimeout(async () => {
    try {
      const response = await client.readResource({
        uri: 'rally://stories?pageSize=5'
      });
      
      console.log(`Received ${response.contents?.length || 0} stories (limited to 5)`);
      if (response._meta) {
        console.log('Meta:', response._meta);
      }
      
      return response;
    } catch (error) {
      console.error('Error reading filtered stories:', error);
      throw error;
    }
  });
}

async function testSingleStory(id) {
  if (!id) {
    console.warn('No story ID available for testing');
    return null;
  }
  
  console.log(`Testing single story resource with ID: ${id}...`);
  
  return testWithTimeout(async () => {
    try {
      const response = await client.readResource({
        uri: `rally://story/${id}`
      });
      
      if (response.contents && response.contents.length > 0) {
        const story = JSON.parse(response.contents[0].text);
        console.log('Story details:', story.Name || '[No name]');
      }
      
      return response;
    } catch (error) {
      console.error('Error reading story:', error);
      throw error;
    }
  });
}

// Main test flow
async function runTests() {
  try {
    await startServer();
    await connectClient();
    
    // Test stories resource
    const storiesResponse = await testStories();
    
    // Test filtered stories
    await testFilteredStories();
    
    // Test single story if we got any stories
    if (storiesResponse && storiesResponse.contents && storiesResponse.contents.length > 0) {
      const firstStory = JSON.parse(storiesResponse.contents[0].text);
      if (firstStory.ObjectID) {
        await testSingleStory(firstStory.ObjectID);
      }
    }
    
    console.log('All tests passed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Tests failed:', error);
    process.exit(1);
  } finally {
    await disconnectClient();
    await stopServer();
  }
}

// Run the tests
runTests().catch((error) => {
  console.error('Uncaught error:', error);
  process.exit(1);
}); 