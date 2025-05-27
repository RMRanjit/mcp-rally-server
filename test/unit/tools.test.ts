import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../../src/handlers/tools';
import { RallyClient } from '../../src/rally/client';

// Mock the Rally client
jest.mock('../../src/rally/client');

describe('Tool Handlers', () => {
  let mockServer: Partial<McpServer>;
  let mockRallyClient: Partial<RallyClient>;
  let toolHandlers: Record<string, Function> = {};

  beforeEach(() => {
    // Reset the captured tool handlers
    toolHandlers = {};

    // Create mock server that captures tool handlers
    mockServer = {
      // Using any here to bypass the complex typing of the tool method
      tool: jest.fn().mockImplementation((name, schema, handler) => {
        toolHandlers[name] = handler;
      }),
    };

    // Create mock Rally client
    mockRallyClient = {
      createStory: jest.fn(),
      updateStory: jest.fn(),
      deleteStory: jest.fn(),
    };

    // Register tool handlers
    registerTools(mockServer as McpServer, mockRallyClient as RallyClient);
  });

  describe('createStory tool', () => {
    it('should create a story with required fields', async () => {
      // Arrange
      const storyData = {
        name: 'Test Story',
        description: 'This is a test story',
      };

      (mockRallyClient.createStory as jest.Mock).mockResolvedValue({
        FormattedID: 'US123',
        ObjectID: 12345,
        Name: 'Test Story',
      });

      // Act
      const result = await toolHandlers.createStory(storyData);

      // Assert
      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('US123');
      expect(mockRallyClient.createStory).toHaveBeenCalledWith({
        Name: 'Test Story',
        Description: 'This is a test story',
      });
    });

    it('should create a story with all optional fields', async () => {
      // Arrange
      const storyData = {
        name: 'Test Story',
        description: 'This is a test story',
        projectId: 'project123',
        state: 'In-Progress',
        estimate: 5,
        priority: 'High',
      };

      (mockRallyClient.createStory as jest.Mock).mockResolvedValue({
        FormattedID: 'US123',
        ObjectID: 12345,
        Name: 'Test Story',
      });

      // Act
      const result = await toolHandlers.createStory(storyData);

      // Assert
      expect(result.isError).toBeFalsy();
      expect(mockRallyClient.createStory).toHaveBeenCalledWith({
        Name: 'Test Story',
        Description: 'This is a test story',
        Project: { _ref: '/project/project123' },
        ScheduleState: 'In-Progress',
        PlanEstimate: 5,
        Priority: 'High',
      });
    });

    it('should handle errors when creating a story', async () => {
      // Arrange
      const storyData = { name: 'Test Story' };
      const errorMessage = 'Failed to create story';
      (mockRallyClient.createStory as jest.Mock).mockRejectedValue(new Error(errorMessage));

      // Act
      const result = await toolHandlers.createStory(storyData);

      // Assert
      expect(result.isError).toBeTruthy();
      expect(result.content[0].text).toContain(errorMessage);
    });
  });

  describe('updateStory tool', () => {
    it('should update a story with provided fields', async () => {
      // Arrange
      const updateData = {
        id: 'US123',
        name: 'Updated Story',
        state: 'Completed',
      };

      (mockRallyClient.updateStory as jest.Mock).mockResolvedValue({
        FormattedID: 'US123',
        ObjectID: 12345,
        Name: 'Updated Story',
      });

      // Act
      const result = await toolHandlers.updateStory(updateData);

      // Assert
      expect(result.isError).toBeFalsy();
      expect(mockRallyClient.updateStory).toHaveBeenCalledWith('US123', {
        Name: 'Updated Story',
        ScheduleState: 'Completed',
      });
    });

    it('should return error when no update fields provided', async () => {
      // Arrange
      const updateData = { id: 'US123' };

      // Act
      const result = await toolHandlers.updateStory(updateData);

      // Assert
      expect(result.isError).toBeTruthy();
      expect(result.content[0].text).toContain('No fields provided for update');
      expect(mockRallyClient.updateStory).not.toHaveBeenCalled();
    });

    it('should handle errors when updating a story', async () => {
      // Arrange
      const updateData = {
        id: 'US123',
        name: 'Updated Story',
      };
      const errorMessage = 'Failed to update story';
      (mockRallyClient.updateStory as jest.Mock).mockRejectedValue(new Error(errorMessage));

      // Act
      const result = await toolHandlers.updateStory(updateData);

      // Assert
      expect(result.isError).toBeTruthy();
      expect(result.content[0].text).toContain(errorMessage);
    });
  });

  describe('deleteStory tool', () => {
    it('should delete a story successfully', async () => {
      // Arrange
      const deleteData = { id: 'US123' };
      (mockRallyClient.deleteStory as jest.Mock).mockResolvedValue({ success: true });

      // Act
      const result = await toolHandlers.deleteStory(deleteData);

      // Assert
      expect(result.isError).toBeFalsy();
      expect(mockRallyClient.deleteStory).toHaveBeenCalledWith('US123');
      expect(result.content[0].text).toContain('Successfully deleted story US123');
    });

    it('should handle errors when deleting a story', async () => {
      // Arrange
      const deleteData = { id: 'US123' };
      const errorMessage = 'Failed to delete story';
      (mockRallyClient.deleteStory as jest.Mock).mockRejectedValue(new Error(errorMessage));

      // Act
      const result = await toolHandlers.deleteStory(deleteData);

      // Assert
      expect(result.isError).toBeTruthy();
      expect(result.content[0].text).toContain(errorMessage);
    });
  });
}); 