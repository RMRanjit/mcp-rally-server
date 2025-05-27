/**
 * Tool Integration Test
 * 
 * This test script verifies that the tool handlers work correctly with the MCP SDK client.
 * It starts a server with mock implementations and connects a client to test the tools.
 */

// Import MCP modules with correct paths (matching main application)
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const express = require('express');

// Import handlers
const { registerTools } = require('../../dist/handlers/tools');

// Create a mock Rally client
class MockRallyClient {
  constructor() {
    this.stories = [
      { ObjectID: 1, FormattedID: 'US1', Name: 'First Story' },
      { ObjectID: 2, FormattedID: 'US2', Name: 'Second Story' }
    ];
  }

  async createStory(data) {
    console.log('[MOCK] Creating story:', data);
    const newStory = {
      ObjectID: Math.floor(Math.random() * 10000),
      FormattedID: `US${Math.floor(Math.random() * 1000)}`,
      Name: data.Name,
      Description: data.Description || '',
      ...data
    };
    this.stories.push(newStory);
    return newStory;
  }

  async updateStory(id, data) {
    console.log(`[MOCK] Updating story ${id}:`, data);
    const storyIndex = this.stories.findIndex(s => s.FormattedID === id);
    if (storyIndex === -1) {
      throw new Error(`Story with ID ${id} not found`);
    }
    
    this.stories[storyIndex] = {
      ...this.stories[storyIndex],
      ...data
    };
    
    return this.stories[storyIndex];
  }

  async deleteStory(id) {
    console.log(`[MOCK] Deleting story ${id}`);
    const storyIndex = this.stories.findIndex(s => s.FormattedID === id);
    if (storyIndex === -1) {
      throw new Error(`Story with ID ${id} not found`);
    }
    
    this.stories.splice(storyIndex, 1);
    return { success: true };
  }
}

// Run the integration test
async function runIntegrationTest() {
  console.log('\n=== TOOL INTEGRATION TEST ===\n');
  
  let server;
  let client;
  let expressApp;
  let httpServer;
  const port = 3333;
  
  try {
    // Create server with mock Rally client
    console.log('Starting MCP server...');
    server = new McpServer({
      name: 'mcp-rally-server-test',
      version: '1.0.0',
      capabilities: {
        resources: {},
        tools: {},
        resourceListing: true
      }
    });
    
    const rallyClient = new MockRallyClient();
    
    // Register tool handlers
    registerTools(server, rallyClient);
    
    // Create Express app for HTTP transport
    expressApp = express();
    expressApp.use(express.json());
    
    // Create a map to store transports by session ID
    const transports = {};
    
    // Set up the HTTP endpoint
    expressApp.post('/mcp', async (req, res) => {
      console.log('Received POST request:', req.body?.method);
      
      const sessionId = req.headers['mcp-session-id'];
      let transport;
      
      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else {
        // Create new transport for a new session
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => Math.random().toString(36).substring(2, 15),
          onsessioninitialized: (sid) => {
            console.log('Session initialized:', sid);
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
    const handleSessionRequest = async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    };
    
    // Set up routes for GET and DELETE
    expressApp.get('/mcp', handleSessionRequest);
    expressApp.delete('/mcp', handleSessionRequest);
    
    // Start the Express server
    return new Promise((resolve) => {
      httpServer = expressApp.listen(port, async () => {
        console.log(`Test server listening on port ${port}`);
        
        try {
          // Create and connect client
          console.log('Connecting MCP client...');
          client = new Client();
          await client.connect({
            type: 'http',
            url: `http://localhost:${port}/mcp`
          });
          console.log('Client connected');
          
          // Test createStory tool
          console.log('\n--- TESTING CREATE STORY TOOL ---');
          const createResult = await client.executeTool({
            name: 'createStory',
            arguments: {
              name: 'Integration Test Story',
              description: 'Created via integration test',
              state: 'Defined',
              estimate: 3,
              priority: 'High'
            }
          });
          
          console.log('Create result:', JSON.stringify(createResult, null, 2));
          if (createResult.isError) {
            throw new Error(`Create story failed: ${createResult.content[0].text}`);
          }
          
          // Test updateStory tool
          console.log('\n--- TESTING UPDATE STORY TOOL ---');
          const updateResult = await client.executeTool({
            name: 'updateStory',
            arguments: {
              id: 'US1',
              name: 'Updated Integration Story',
              state: 'In-Progress',
              estimate: 5
            }
          });
          
          console.log('Update result:', JSON.stringify(updateResult, null, 2));
          if (updateResult.isError) {
            throw new Error(`Update story failed: ${updateResult.content[0].text}`);
          }
          
          // Test deleteStory tool
          console.log('\n--- TESTING DELETE STORY TOOL ---');
          const deleteResult = await client.executeTool({
            name: 'deleteStory',
            arguments: {
              id: 'US2'
            }
          });
          
          console.log('Delete result:', JSON.stringify(deleteResult, null, 2));
          if (deleteResult.isError) {
            throw new Error(`Delete story failed: ${deleteResult.content[0].text}`);
          }
          
          // Test validation error
          console.log('\n--- TESTING VALIDATION ERROR ---');
          const validationResult = await client.executeTool({
            name: 'updateStory',
            arguments: {
              id: 'US1'
            }
          });
          
          console.log('Validation result:', JSON.stringify(validationResult, null, 2));
          if (!validationResult.isError) {
            throw new Error('Validation error test failed - expected an error response');
          }
          
          console.log('\n=== INTEGRATION TEST PASSED ===');
          resolve(true);
        } catch (error) {
          console.error('\n=== INTEGRATION TEST FAILED ===');
          console.error('Error:', error.message);
          resolve(false);
        } finally {
          // Clean up resources
          console.log('\nCleaning up...');
          if (client) {
            try {
              await client.disconnect();
              console.log('Client disconnected');
            } catch (error) {
              console.error('Error disconnecting client:', error.message);
            }
          }
          
          httpServer.close(() => {
            console.log('HTTP server closed');
          });
        }
      });
    });
  } catch (error) {
    console.error('\n=== INTEGRATION TEST FAILED DURING SETUP ===');
    console.error('Error:', error.message);
    
    // Clean up if server was started
    if (httpServer) {
      httpServer.close();
    }
    
    return false;
  }
}

// Run the test and exit with appropriate code
runIntegrationTest()
  .then(success => {
    console.log(`\nExiting with ${success ? 'success' : 'failure'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 