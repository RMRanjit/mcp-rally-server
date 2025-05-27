/**
 * Direct Relationship Tool Test
 * 
 * This test directly calls the relationship tool handler functions to verify their behavior.
 */

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
      }
    };
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
}

// Mock MCP server to capture tool handlers
class MockMcpServer {
  constructor() {
    this.toolHandlers = {};
  }

  tool(name, schema, handler) {
    console.log(`Registering tool: ${name}`);
    this.toolHandlers[name] = handler;
    return this;
  }
}

async function runTests() {
  console.log('\n=== DIRECT RELATIONSHIP TOOL TEST ===\n');
  
  try {
    // Create mock dependencies
    const mockRallyClient = new MockRallyClient();
    const mockServer = new MockMcpServer();
    
    // Register the tools (this will populate mockServer.toolHandlers)
    registerTools(mockServer, mockRallyClient);
    
    // Get the relationship handlers
    const { createRelationship, removeRelationship, getRelationships } = mockServer.toolHandlers;
    if (!createRelationship || !removeRelationship || !getRelationships) {
      throw new Error('One or more required relationship handlers were not registered');
    }
    
    // Test getRelationships
    console.log('\n--- TESTING GET RELATIONSHIPS ---');
    const getParams = {
      artifactId: 'US1'
    };
    
    const getResult = await getRelationships(getParams);
    console.log('Get result:', JSON.stringify(getResult, null, 2));
    if (getResult.isError) {
      throw new Error(`Get relationships failed: ${getResult.content[0].text}`);
    }
    
    // Test createRelationship
    console.log('\n--- TESTING CREATE RELATIONSHIP ---');
    const createParams = {
      sourceId: 'US5',
      targetId: 'US1',
      relationshipType: 'Predecessor'
    };
    
    const createResult = await createRelationship(createParams);
    console.log('Create result:', JSON.stringify(createResult, null, 2));
    if (createResult.isError) {
      throw new Error(`Create relationship failed: ${createResult.content[0].text}`);
    }
    
    // Verify the relationship was created
    const verifyCreateParams = {
      artifactId: 'US5'
    };
    
    const verifyCreateResult = await getRelationships(verifyCreateParams);
    console.log('Verify create result:', JSON.stringify(verifyCreateResult, null, 2));
    
    // Test removeRelationship
    console.log('\n--- TESTING REMOVE RELATIONSHIP ---');
    const removeParams = {
      sourceId: 'US1',
      targetId: 'US2',
      relationshipType: 'Predecessor'
    };
    
    const removeResult = await removeRelationship(removeParams);
    console.log('Remove result:', JSON.stringify(removeResult, null, 2));
    if (removeResult.isError) {
      throw new Error(`Remove relationship failed: ${removeResult.content[0].text}`);
    }
    
    // Verify the relationship was removed
    const verifyRemoveParams = {
      artifactId: 'US1'
    };
    
    const verifyRemoveResult = await getRelationships(verifyRemoveParams);
    console.log('Verify remove result:', JSON.stringify(verifyRemoveResult, null, 2));
    
    // Test error scenarios
    console.log('\n--- TESTING ERROR SCENARIOS ---');
    
    // Test creating relationship with same source and target
    const errorParams = {
      sourceId: 'US1',
      targetId: 'US1',
      relationshipType: 'Predecessor'
    };
    
    const errorResult = await createRelationship(errorParams);
    console.log('Error result:', JSON.stringify(errorResult, null, 2));
    if (!errorResult.isError) {
      throw new Error('Error scenario test failed - expected an error response');
    }
    
    console.log('\n=== ALL TESTS PASSED ===');
    return true;
  } catch (error) {
    console.error('\n=== TEST FAILED ===');
    console.error('Error:', error.message);
    return false;
  }
}

// Run the tests
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 