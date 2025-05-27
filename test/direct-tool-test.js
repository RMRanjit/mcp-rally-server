/**
 * Direct Tool Test
 * 
 * This test directly calls the tool handler functions without using the MCP client/server
 * infrastructure. This helps verify that our handlers are working correctly independently
 * of the MCP transport layer.
 */

const { registerTools } = require('../dist/handlers/tools');

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
  console.log('\n=== DIRECT TOOL TEST ===\n');
  
  try {
    // Create mock dependencies
    const mockRallyClient = new MockRallyClient();
    const mockServer = new MockMcpServer();
    
    // Register the tools (this will populate mockServer.toolHandlers)
    registerTools(mockServer, mockRallyClient);
    
    // Get the handlers
    const { createStory, updateStory, deleteStory } = mockServer.toolHandlers;
    if (!createStory || !updateStory || !deleteStory) {
      throw new Error('One or more required tool handlers were not registered');
    }
    
    // Test createStory
    console.log('\n--- TESTING CREATE STORY ---');
    const createParams = {
      name: 'Test Story',
      description: 'Created via direct test',
      state: 'Defined',
      estimate: 3,
      priority: 'High'
    };
    
    const createResult = await createStory(createParams);
    console.log('Create result:', JSON.stringify(createResult, null, 2));
    if (createResult.isError) {
      throw new Error(`Create story failed: ${createResult.content[0].text}`);
    }
    
    // Test updateStory
    console.log('\n--- TESTING UPDATE STORY ---');
    const updateParams = {
      id: 'US1',
      name: 'Updated Test Story',
      state: 'In-Progress',
      estimate: 5
    };
    
    const updateResult = await updateStory(updateParams);
    console.log('Update result:', JSON.stringify(updateResult, null, 2));
    if (updateResult.isError) {
      throw new Error(`Update story failed: ${updateResult.content[0].text}`);
    }
    
    // Test deleteStory
    console.log('\n--- TESTING DELETE STORY ---');
    const deleteParams = {
      id: 'US2'
    };
    
    const deleteResult = await deleteStory(deleteParams);
    console.log('Delete result:', JSON.stringify(deleteResult, null, 2));
    if (deleteResult.isError) {
      throw new Error(`Delete story failed: ${deleteResult.content[0].text}`);
    }
    
    // Test validation error
    console.log('\n--- TESTING VALIDATION ERROR ---');
    const validationParams = {
      id: 'US1'
    };
    
    const validationResult = await updateStory(validationParams);
    console.log('Validation result:', JSON.stringify(validationResult, null, 2));
    if (!validationResult.isError) {
      throw new Error('Validation error test failed - expected an error response');
    }
    
    // Add test for error handling
    console.log('\n--- TESTING ERROR HANDLING ---');
    
    // Modify client to throw errors
    mockRallyClient.createStory = async () => {
      throw new Error('Mock error from Rally API');
    };
    
    const errorResult = await createStory({ name: 'Error Test' });
    console.log('Error handling result:', JSON.stringify(errorResult, null, 2));
    if (!errorResult.isError) {
      throw new Error('Error handling test failed - expected an error response');
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