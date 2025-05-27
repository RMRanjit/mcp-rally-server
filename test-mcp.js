// Simple MCP server test
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { spawn } = require('child_process');

// Start the server as a separate process
console.log('Starting MCP server...');
const server = spawn('node', ['dist/index.js', '--http'], {
  stdio: 'inherit'
});

// Wait for server to start
setTimeout(async () => {
  try {
    console.log('Initializing MCP client...');
    
    // Create client
    const client = new Client({
      name: 'test-client',
      version: '1.0.0'
    });
    
    // Connect to our local MCP server
    console.log('Connecting to MCP server...');
    const transport = new StreamableHTTPClientTransport(
      new URL('http://localhost:3000/mcp')
    );
    
    await client.connect(transport);
    console.log('Connected successfully!');
    
    // List resources
    console.log('\nListing resources...');
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
    
    // Kill the server gracefully
    console.log('Stopping server...');
    try {
      if (server.pid) {
        process.kill(server.pid);
      }
    } catch (e) {
      console.log('Note: Server may already have been terminated or is running in background');
    }
    
    console.log('Test completed');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    try {
      if (server.pid) {
        process.kill(server.pid);
      }
    } catch (e) {
      // Ignore error if server already terminated
    }
    process.exit(1);
  }
}, 2000); // Wait 2 seconds for the server to start 