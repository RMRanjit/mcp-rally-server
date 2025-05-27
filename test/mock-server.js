/**
 * Mock MCP server for testing relationship tools
 * 
 * This is a simplified version of the MCP server specifically for testing
 * with an actual MCP client. It mocks the Rally client so no external API calls are made.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const express = require('express');
const { registerTools } = require('../dist/handlers/tools');

// Create a mock Rally client
class MockRallyClient {
  constructor() {
    this.relationships = {
      'US1': {
        predecessors: ['US2'],
        successors: [],
        children: ['US3', 'US4'],
        parent: null,
        blocked: [],
        blockers: [],
      },
      'US2': {
        predecessors: [],
        successors: ['US1'],
        children: [],
        parent: null,
        blocked: [],
        blockers: [],
      },
      'US3': {
        predecessors: [],
        successors: [],
        children: [],
        parent: 'US1',
        blocked: [],
        blockers: [],
      },
      'US4': {
        predecessors: [],
        successors: [],
        children: [],
        parent: 'US1',
        blocked: [],
        blockers: [],
      },
    };
  }

  // Basic CRUD operations for stories
  async createStory(data) {
    console.log('[MOCK] Creating story:', data);
    return {
      ObjectID: Math.floor(Math.random() * 10000),
      FormattedID: `US${Math.floor(Math.random() * 1000)}`,
      Name: data.Name,
      Description: data.Description || '',
    };
  }

  async updateStory(id, data) {
    console.log(`[MOCK] Updating story ${id}:`, data);
    return { success: true };
  }

  async deleteStory(id) {
    console.log(`[MOCK] Deleting story ${id}`);
    return { success: true };
  }

  // Relationship methods
  async getRelationships(artifactId) {
    console.log(`[MOCK] Getting relationships for ${artifactId}`);
    
    // Return empty response if the artifact doesn't exist
    if (!this.relationships[artifactId]) {
      return { HierarchicalRequirement: {} };
    }
    
    // Format the relationships for the response
    const relationships = this.relationships[artifactId];
    const response = {
      HierarchicalRequirement: {}
    };
    
    if (relationships.predecessors.length > 0) {
      response.HierarchicalRequirement.Predecessors = {
        _tagsNameArray: relationships.predecessors
      };
    }
    
    if (relationships.successors.length > 0) {
      response.HierarchicalRequirement.Successors = {
        _tagsNameArray: relationships.successors
      };
    }
    
    if (relationships.children.length > 0) {
      response.HierarchicalRequirement.Children = {
        _tagsNameArray: relationships.children
      };
    }
    
    if (relationships.parent) {
      response.HierarchicalRequirement.Parent = {
        _refObjectName: relationships.parent
      };
    }
    
    if (relationships.blocked.length > 0) {
      response.HierarchicalRequirement.Blocked = {
        _tagsNameArray: relationships.blocked
      };
    }
    
    if (relationships.blockers.length > 0) {
      response.HierarchicalRequirement.Blocker = {
        _tagsNameArray: relationships.blockers
      };
    }
    
    return response;
  }

  async createRelationship(sourceId, targetId, relationshipType) {
    console.log(`[MOCK] Creating ${relationshipType} relationship from ${sourceId} to ${targetId}`);
    
    // Initialize the relationship entry if it doesn't exist
    if (!this.relationships[sourceId]) {
      this.relationships[sourceId] = {
        predecessors: [],
        successors: [],
        children: [],
        parent: null,
        blocked: [],
        blockers: [],
      };
    }
    
    if (!this.relationships[targetId]) {
      this.relationships[targetId] = {
        predecessors: [],
        successors: [],
        children: [],
        parent: null,
        blocked: [],
        blockers: [],
      };
    }
    
    // Add the relationship based on its type
    switch (relationshipType) {
      case 'Predecessor':
        this.relationships[sourceId].predecessors.push(targetId);
        this.relationships[targetId].successors.push(sourceId);
        break;
      case 'Successor':
        this.relationships[sourceId].successors.push(targetId);
        this.relationships[targetId].predecessors.push(sourceId);
        break;
      case 'Parent':
        this.relationships[sourceId].parent = targetId;
        this.relationships[targetId].children.push(sourceId);
        break;
      case 'Child':
        this.relationships[sourceId].children.push(targetId);
        this.relationships[targetId].parent = sourceId;
        break;
      case 'Blocker':
        this.relationships[sourceId].blockers.push(targetId);
        this.relationships[targetId].blocked.push(sourceId);
        break;
      case 'Blocked':
        this.relationships[sourceId].blocked.push(targetId);
        this.relationships[targetId].blockers.push(sourceId);
        break;
    }
    
    return { success: true };
  }

  async removeRelationship(sourceId, targetId, relationshipType) {
    console.log(`[MOCK] Removing ${relationshipType} relationship from ${sourceId} to ${targetId}`);
    
    // Return early if the relationship entries don't exist
    if (!this.relationships[sourceId] || !this.relationships[targetId]) {
      return { success: true };
    }
    
    // Remove the relationship based on its type
    switch (relationshipType) {
      case 'Predecessor':
        this.relationships[sourceId].predecessors = this.relationships[sourceId].predecessors.filter(id => id !== targetId);
        this.relationships[targetId].successors = this.relationships[targetId].successors.filter(id => id !== sourceId);
        break;
      case 'Successor':
        this.relationships[sourceId].successors = this.relationships[sourceId].successors.filter(id => id !== targetId);
        this.relationships[targetId].predecessors = this.relationships[targetId].predecessors.filter(id => id !== sourceId);
        break;
      case 'Parent':
        this.relationships[sourceId].parent = null;
        this.relationships[targetId].children = this.relationships[targetId].children.filter(id => id !== sourceId);
        break;
      case 'Child':
        this.relationships[sourceId].children = this.relationships[sourceId].children.filter(id => id !== targetId);
        this.relationships[targetId].parent = null;
        break;
      case 'Blocker':
        this.relationships[sourceId].blockers = this.relationships[sourceId].blockers.filter(id => id !== targetId);
        this.relationships[targetId].blocked = this.relationships[targetId].blocked.filter(id => id !== sourceId);
        break;
      case 'Blocked':
        this.relationships[sourceId].blocked = this.relationships[sourceId].blocked.filter(id => id !== targetId);
        this.relationships[targetId].blockers = this.relationships[targetId].blockers.filter(id => id !== sourceId);
        break;
    }
    
    return { success: true };
  }
}

async function startServer() {
  try {
    const port = process.env.PORT || 3456;
    
    // Create MCP server
    console.log('Creating MCP server...');
    const server = new McpServer({
      name: 'mcp-rally-server-test',
      version: '1.0.0',
      capabilities: {
        resources: {},
        tools: {},
        resourceListing: true
      }
    });
    
    // Create mock Rally client
    const rallyClient = new MockRallyClient();
    
    // Register tool handlers
    registerTools(server, rallyClient);
    
    // Create Express app for HTTP transport
    const app = express();
    app.use(express.json());
    
    // Create a map to store transports by session ID
    const transports = {};
    
    // Set up the HTTP endpoint
    app.post('/mcp', async (req, res) => {
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
    app.get('/mcp', handleSessionRequest);
    app.delete('/mcp', handleSessionRequest);
    
    // Start the Express server
    app.listen(port, () => {
      console.log(`HTTP server listening on port ${port}`);
    });
  } catch (error) {
    console.error('Server failed to start:', error);
    process.exit(1);
  }
}

// Start the server
startServer(); 