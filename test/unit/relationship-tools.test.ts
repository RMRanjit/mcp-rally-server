import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../../src/handlers/tools';
import { RallyClient } from '../../src/rally/client';

// Mock the Rally client
jest.mock('../../src/rally/client');

describe('Relationship Tools', () => {
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
      createRelationship: jest.fn(),
      removeRelationship: jest.fn(),
      getRelationships: jest.fn(),
    };

    // Register tool handlers
    registerTools(mockServer as McpServer, mockRallyClient as RallyClient);
  });

  describe('createRelationship tool', () => {
    it('should create a relationship between artifacts', async () => {
      // Arrange
      const relationshipData = {
        sourceId: 'US123',
        targetId: 'US456',
        relationshipType: 'Predecessor'
      };

      (mockRallyClient.createRelationship as jest.Mock).mockResolvedValue({
        success: true
      });

      // Act
      const result = await toolHandlers.createRelationship(relationshipData);

      // Assert
      expect(result.isError).toBeFalsy();
      expect(mockRallyClient.createRelationship).toHaveBeenCalledWith('US123', 'US456', 'Predecessor');
      expect(result.content[0].text).toContain('Successfully created');
    });

    it('should prevent creating relationship between the same artifact', async () => {
      // Arrange
      const relationshipData = {
        sourceId: 'US123',
        targetId: 'US123', // Same as source
        relationshipType: 'Predecessor'
      };

      // Act
      const result = await toolHandlers.createRelationship(relationshipData);

      // Assert
      expect(result.isError).toBeTruthy();
      expect(mockRallyClient.createRelationship).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('Source and target cannot be the same');
    });

    it('should handle errors when creating relationship', async () => {
      // Arrange
      const relationshipData = {
        sourceId: 'US123',
        targetId: 'US456',
        relationshipType: 'Predecessor'
      };

      const errorMessage = 'Failed to create relationship';
      (mockRallyClient.createRelationship as jest.Mock).mockRejectedValue(new Error(errorMessage));

      // Act
      const result = await toolHandlers.createRelationship(relationshipData);

      // Assert
      expect(result.isError).toBeTruthy();
      expect(result.content[0].text).toContain(errorMessage);
    });
  });

  describe('removeRelationship tool', () => {
    it('should remove a relationship between artifacts', async () => {
      // Arrange
      const relationshipData = {
        sourceId: 'US123',
        targetId: 'US456',
        relationshipType: 'Predecessor'
      };

      (mockRallyClient.removeRelationship as jest.Mock).mockResolvedValue({
        success: true
      });

      // Act
      const result = await toolHandlers.removeRelationship(relationshipData);

      // Assert
      expect(result.isError).toBeFalsy();
      expect(mockRallyClient.removeRelationship).toHaveBeenCalledWith('US123', 'US456', 'Predecessor');
      expect(result.content[0].text).toContain('Successfully removed');
    });

    it('should handle errors when removing relationship', async () => {
      // Arrange
      const relationshipData = {
        sourceId: 'US123',
        targetId: 'US456',
        relationshipType: 'Predecessor'
      };

      const errorMessage = 'Failed to remove relationship';
      (mockRallyClient.removeRelationship as jest.Mock).mockRejectedValue(new Error(errorMessage));

      // Act
      const result = await toolHandlers.removeRelationship(relationshipData);

      // Assert
      expect(result.isError).toBeTruthy();
      expect(result.content[0].text).toContain(errorMessage);
    });
  });

  describe('getRelationships tool', () => {
    it('should get relationships for an artifact', async () => {
      // Arrange
      const artifactData = {
        artifactId: 'US123'
      };

      const mockRelationships = {
        HierarchicalRequirement: {
          Predecessors: {
            _tagsNameArray: ['US456']
          },
          Successors: {
            _tagsNameArray: ['US789']
          },
          Parent: {
            _refObjectName: 'Feature1'
          }
        }
      };

      (mockRallyClient.getRelationships as jest.Mock).mockResolvedValue(mockRelationships);

      // Act
      const result = await toolHandlers.getRelationships(artifactData);

      // Assert
      expect(result.isError).toBeFalsy();
      expect(mockRallyClient.getRelationships).toHaveBeenCalledWith('US123');
      expect(result.content[0].text).toContain('Relationships for US123');
      expect(result.content[0].text).toContain('Feature1');
      expect(result.content[0].text).toContain('US456');
      expect(result.content[0].text).toContain('US789');
    });

    it('should handle errors when getting relationships', async () => {
      // Arrange
      const artifactData = {
        artifactId: 'US123'
      };

      const errorMessage = 'Failed to get relationships';
      (mockRallyClient.getRelationships as jest.Mock).mockRejectedValue(new Error(errorMessage));

      // Act
      const result = await toolHandlers.getRelationships(artifactData);

      // Assert
      expect(result.isError).toBeTruthy();
      expect(result.content[0].text).toContain(errorMessage);
    });
  });
}); 