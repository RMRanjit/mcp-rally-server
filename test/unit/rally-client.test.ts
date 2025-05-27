import axios from 'axios';
import { RallyClient } from '../../src/rally/client';
import { Config } from '../../src/config';

// Mock axios
jest.mock('axios', () => {
  return {
    create: jest.fn(() => ({
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      defaults: {
        headers: {
          common: {
            'zsessionid': 'mock-session-id'
          }
        }
      }
    })),
    isAxiosError: jest.fn().mockReturnValue(true)
  };
});
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('RallyClient', () => {
  let client: RallyClient;
  const mockConfig: Config = {
    rallyApiKey: 'test-api-key',
    rallyWorkspace: 'test-workspace',
    rallyProject: 'test-project',
    port: 3000,
    logLevel: 'info'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocked response for axios.create
    mockAxios.create.mockReturnValue({
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn()
    } as any);
    
    client = new RallyClient(mockConfig);
  });

  describe('getStories', () => {
    it('should fetch stories from Rally API', async () => {
      // Setup mock for the axios instance
      const mockGet = mockAxios.create().get as jest.Mock;
      mockGet.mockResolvedValueOnce({
        data: {
          Results: [
            { ObjectID: 1, FormattedID: 'US1', Name: 'Story 1' },
            { ObjectID: 2, FormattedID: 'US2', Name: 'Story 2' }
          ]
        }
      });

      // Call the method
      const result = await client.getStories();

      // Assertions
      expect(mockGet).toHaveBeenCalledWith('/HierarchicalRequirement', {
        params: {
          workspace: '/workspace/test-workspace',
          project: '/project/test-project'
        }
      });
      expect(result.Results).toHaveLength(2);
      expect(result.Results[0].FormattedID).toBe('US1');
    });

    it('should include query parameters when provided', async () => {
      // Setup mock
      const mockGet = mockAxios.create().get as jest.Mock;
      mockGet.mockResolvedValueOnce({
        data: { Results: [] }
      });

      // Call with query params
      await client.getStories({ 
        query: '(Name contains "test")',
        pagesize: '20' 
      });

      // Assertions
      expect(mockGet).toHaveBeenCalledWith('/HierarchicalRequirement', {
        params: {
          workspace: '/workspace/test-workspace',
          project: '/project/test-project',
          query: '(Name contains "test")',
          pagesize: '20'
        }
      });
    });

    it('should handle errors properly', async () => {
      // Setup mock to throw an error
      const mockGet = mockAxios.create().get as jest.Mock;
      
      // Create a proper Axios error object
      const axiosError = new Error('Network Error');
      (axiosError as any).isAxiosError = true;
      
      mockGet.mockRejectedValueOnce(axiosError);

      // Call and expect error, without checking specific message
      await expect(client.getStories()).rejects.toThrow();
    });
  });

  describe('getStory', () => {
    it('should fetch a single story by ID', async () => {
      // Setup mock
      const mockGet = mockAxios.create().get as jest.Mock;
      mockGet.mockResolvedValueOnce({
        data: { 
          ObjectID: 1, 
          FormattedID: 'US1', 
          Name: 'Test Story' 
        }
      });

      // Call the method
      const result = await client.getStory('1');

      // Assertions
      expect(mockGet).toHaveBeenCalledWith('/HierarchicalRequirement/1', expect.any(Object));
      expect(result.FormattedID).toBe('US1');
    });
  });

  describe('createStory', () => {
    it('should create a new story', async () => {
      // Setup mock
      const mockPost = mockAxios.create().post as jest.Mock;
      mockPost.mockResolvedValueOnce({
        data: {
          CreateResult: {
            Object: {
              ObjectID: 3,
              FormattedID: 'US3',
              Name: 'New Story'
            }
          }
        }
      });

      // Call the method
      const result = await client.createStory({
        Name: 'New Story',
        Description: 'Story Description'
      });

      // Assertions
      expect(mockPost).toHaveBeenCalledWith('/HierarchicalRequirement/create', {
        HierarchicalRequirement: {
          Name: 'New Story',
          Description: 'Story Description',
          Workspace: { _ref: '/workspace/test-workspace' },
          Project: { _ref: '/project/test-project' }
        }
      });
      expect(result.FormattedID).toBe('US3');
      expect(result.Name).toBe('New Story');
    });

    it('should use provided project if specified', async () => {
      // Setup mock
      const mockPost = mockAxios.create().post as jest.Mock;
      mockPost.mockResolvedValueOnce({
        data: {
          CreateResult: {
            Object: { ObjectID: 4, FormattedID: 'US4' }
          }
        }
      });

      // Call with custom project
      await client.createStory({
        Name: 'Project Story',
        Project: { _ref: '/project/custom-project' }
      });

      // Assert project was used
      expect(mockPost).toHaveBeenCalledWith(
        '/HierarchicalRequirement/create',
        expect.objectContaining({
          HierarchicalRequirement: expect.objectContaining({
            Project: { _ref: '/project/custom-project' }
          })
        })
      );
    });
  });

  describe('updateStory', () => {
    it('should update an existing story', async () => {
      // Setup mock
      const mockPost = mockAxios.create().post as jest.Mock;
      mockPost.mockResolvedValueOnce({
        data: { 
          OperationResult: { 
            Object: { 
              ObjectID: 1, 
              FormattedID: 'US1', 
              Name: 'Updated Name' 
            } 
          } 
        }
      });

      // Call the method
      await client.updateStory('1', { 
        Name: 'Updated Name' 
      });

      // Assertions
      expect(mockPost).toHaveBeenCalledWith('/HierarchicalRequirement/1', {
        HierarchicalRequirement: { 
          Name: 'Updated Name' 
        }
      });
    });
  });

  describe('deleteStory', () => {
    it('should delete a story', async () => {
      // Setup mock
      const mockDelete = mockAxios.create().delete as jest.Mock;
      mockDelete.mockResolvedValueOnce({
        data: { 
          OperationResult: { 
            Success: true 
          } 
        }
      });

      // Call the method
      await client.deleteStory('1');

      // Assertions
      expect(mockDelete).toHaveBeenCalledWith('/HierarchicalRequirement/1');
    });
  });
}); 