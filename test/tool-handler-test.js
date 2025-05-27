/**
 * Tool Handler Test Script
 * 
 * This script tests the tool handlers by directly invoking them with mock data
 * and displaying the results. It's useful for manual verification of tool behavior.
 */

const { registerTools } = require('../dist/handlers/tools');

// Mock Rally client with controllable behavior
class MockRallyClient {
  constructor(config = {}) {
    // Default behavior is success
    this.shouldSucceed = config.shouldSucceed !== false;
    this.mockStories = config.mockStories || [];
    this.errorMessage = config.errorMessage || 'Mock Rally API error';
    this.delay = config.delay || 100; // ms delay to simulate network
  }

  async createStory(data) {
    console.log('Creating story with data:', JSON.stringify(data, null, 2));
    await this.simulateDelay();
    
    if (!this.shouldSucceed) {
      throw new Error(this.errorMessage);
    }
    
    return {
      FormattedID: 'US' + Math.floor(Math.random() * 1000),
      ObjectID: Math.floor(Math.random() * 10000),
      Name: data.Name,
      Description: data.Description || '',
      ...data
    };
  }

  async updateStory(id, data) {
    console.log(`Updating story ${id} with data:`, JSON.stringify(data, null, 2));
    await this.simulateDelay();
    
    if (!this.shouldSucceed) {
      throw new Error(this.errorMessage);
    }
    
    return {
      FormattedID: id,
      ObjectID: Math.floor(Math.random() * 10000),
      ...data
    };
  }

  async deleteStory(id) {
    console.log(`Deleting story ${id}`);
    await this.simulateDelay();
    
    if (!this.shouldSucceed) {
      throw new Error(this.errorMessage);
    }
    
    return { success: true };
  }

  async simulateDelay() {
    return new Promise(resolve => setTimeout(resolve, this.delay));
  }
}

// Mock MCP server
class MockMcpServer {
  constructor() {
    this.toolHandlers = {};
  }

  tool(name, schema, handler) {
    console.log(`Registering tool: ${name}`);
    this.toolHandlers[name] = handler;
    return this;
  }

  async executeToolByName(name, params) {
    if (!this.toolHandlers[name]) {
      throw new Error(`Tool "${name}" not registered`);
    }
    console.log(`\nExecuting tool: ${name}`);
    console.log(`Parameters:`, JSON.stringify(params, null, 2));
    
    try {
      const result = await this.toolHandlers[name](params);
      console.log(`Result:`, JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error(`Error executing tool ${name}:`, error);
      throw error;
    }
  }
}

async function runTests() {
  console.log('=== TOOL HANDLER TEST ===\n');

  console.log('Setting up test environment...');
  
  // 1. Test successful operations
  const successClient = new MockRallyClient({ shouldSucceed: true });
  const successServer = new MockMcpServer();
  
  registerTools(successServer, successClient);
  
  console.log('\n--- SUCCESSFUL OPERATIONS ---');
  
  // Create Story
  await successServer.executeToolByName('createStory', {
    name: 'Test Story',
    description: 'This is a test story',
    projectId: 'project123',
    state: 'In-Progress',
    estimate: 5,
    priority: 'High'
  });
  
  // Update Story
  await successServer.executeToolByName('updateStory', {
    id: 'US123',
    name: 'Updated Story',
    description: 'Updated description',
    state: 'Completed',
    estimate: 8
  });
  
  // Delete Story
  await successServer.executeToolByName('deleteStory', {
    id: 'US123'
  });

  // 2. Test error conditions
  console.log('\n--- ERROR CONDITIONS ---');
  
  const errorClient = new MockRallyClient({ 
    shouldSucceed: false,
    errorMessage: 'Rally API connection failed' 
  });
  
  const errorServer = new MockMcpServer();
  registerTools(errorServer, errorClient);
  
  // Failed create
  await errorServer.executeToolByName('createStory', {
    name: 'Error Story'
  }).catch(e => console.log('Expected error caught'));
  
  // Failed update
  await errorServer.executeToolByName('updateStory', {
    id: 'US123',
    name: 'Will Fail'
  }).catch(e => console.log('Expected error caught'));
  
  // Failed delete
  await errorServer.executeToolByName('deleteStory', {
    id: 'US123'
  }).catch(e => console.log('Expected error caught'));
  
  // 3. Test validation
  console.log('\n--- VALIDATION TESTS ---');
  
  const validationServer = new MockMcpServer();
  registerTools(validationServer, successClient);
  
  // No fields for update
  await validationServer.executeToolByName('updateStory', {
    id: 'US123'
  }).catch(e => console.log('Expected validation error caught'));
  
  console.log('\n=== TEST COMPLETE ===');
}

// Run the tests
runTests().catch(error => {
  console.error('Test failed with error:', error);
  process.exit(1);
}); 