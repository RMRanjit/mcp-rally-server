import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RallyClient } from '../rally/client';

/**
 * Helper function to handle stories with any query parameters
 */
async function handleStories(uri: any, rallyClient: RallyClient) {
  try {
    console.log('Fetching Rally stories from handler:', uri.toString());
    
    // Parse URL parameters if any
    const url = new URL(uri.toString());
    const queryParams: Record<string, string> = {};
    
    // Extract query parameters
    url.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });
    
    console.log('Query parameters:', queryParams);
    
    const data = await rallyClient.getStories(queryParams);
    
    if (!data || !data.Results) {
      return {
        contents: [],
        _meta: {
          message: 'No stories found'
        }
      };
    }
    
    return {
      contents: data.Results.map((story: any) => ({
        uri: `rally://story/${story.ObjectID}`,
        text: JSON.stringify(story, null, 2)
      })),
      _meta: {
        total: data.TotalResultCount || data.Results.length,
        pageSize: data.PageSize || data.Results.length,
        startIndex: data.StartIndex || 1,
        hasMore: (data.StartIndex + data.PageSize) < data.TotalResultCount
      }
    };
  } catch (error) {
    console.error('Error fetching stories:', error);
    return {
      contents: [],
      _meta: {
        error: `Failed to fetch stories: ${(error as Error).message}`
      }
    };
  }
}

/**
 * Register resource handlers with the MCP server
 */
export function registerResources(server: McpServer, rallyClient: RallyClient): void {
  console.log('Registering Rally resource handlers...');

  // Register test resource
  server.resource(
    'test',
    'rally://test',
    async (uri) => {
      console.log('Test resource handler called with URI:', uri.toString());
      return {
        contents: [
          {
            uri: 'rally://test',
            text: 'This is a test resource from the main server'
          }
        ]
      };
    }
  );

  // Register handler for stories without query parameters
  server.resource(
    'stories',
    'rally://stories',
    async (uri) => handleStories(uri, rallyClient)
  );

  // Register handler specifically for stories with pageSize parameter
  server.resource(
    'stories-pagesize',
    'rally://stories?pageSize=5',
    async (uri) => handleStories(uri, rallyClient)
  );

  // Register handler specifically for stories with any query parameters
  server.resource(
    'stories-query',
    new ResourceTemplate('rally://stories{?}', { list: undefined }),
    async (uri) => handleStories(uri, rallyClient)
  );

  // Register story resource - handles individual stories by ID
  server.resource(
    'story',
    new ResourceTemplate('rally://story/{id}', { list: undefined }),
    async (uri, params) => {
      try {
        const id = params.id.toString(); // Ensure id is treated as a string
        console.log(`Fetching Rally story with ID: ${id}`);
        const data = await rallyClient.getStory(id);
        
        if (!data) {
          return {
            contents: [],
            _meta: {
              error: `Story not found with ID: ${id}`
            }
          };
        }
        
        return {
          contents: [
            {
              uri: `rally://story/${id}`,
              text: JSON.stringify(data, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error(`Error fetching story:`, error);
        return {
          contents: [],
          _meta: {
            error: `Failed to fetch story: ${(error as Error).message}`
          }
        };
      }
    }
  );

  console.log('Resource handlers registered');
} 