import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RallyClient, RelationshipType } from '../rally/client';

/**
 * Register tool handlers with the MCP server
 */
export function registerTools(server: McpServer, rallyClient: RallyClient): void {
  // Create Story Tool
  server.tool(
    'createStory',
    {
      name: z.string().min(1, "Story name is required"),
      description: z.string().optional(),
      projectId: z.string().optional(),
      state: z.string().optional(),
      estimate: z.number().optional(),
      priority: z.string().optional(),
    },
    async ({ name, description, projectId, state, estimate, priority }, context) => {
      // In the createStory handler
      try {
        // Access the progress update function
        const sendProgressUpdate = (server as any).sendProgressUpdate;
        
        // Send initial progress update
        if (sendProgressUpdate) {
          sendProgressUpdate('createStory', 10, 'Preparing story data');
        }
        
        // Prepare data for Rally API
        const storyData: any = {
          Name: name,
          Description: description,
        };
      
        // Add optional fields if provided
        if (projectId) {
          storyData.Project = { _ref: `/project/${projectId}` };
        }
        if (state) {
          storyData.ScheduleState = state;
        }
        if (estimate) {
          storyData.PlanEstimate = estimate;
        }
        if (priority) {
          storyData.Priority = priority;
        }
      
        // Send progress update before API call
        if (sendProgressUpdate) {
          sendProgressUpdate('createStory', 50, 'Sending request to Rally API');
        }
      
        // Create the story in Rally
        const result = await rallyClient.createStory(storyData);
      
        // Send completion progress update
        if (sendProgressUpdate) {
          sendProgressUpdate('createStory', 100, 'Story created successfully');
        }
      
        // Return the result
        return {
          content: [
            { 
              type: 'text', 
              text: `Successfully created story "${name}" with ID ${(result as any).FormattedID}` 
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            { 
              type: 'text', 
              text: `Error creating story: ${(error as Error).message}` 
            }
          ],
          isError: true
        };
      }
    }
  );

  // Update Story Tool
  server.tool(
    'updateStory',
    {
      id: z.string().min(1, "Story ID is required"),
      name: z.string().optional(),
      description: z.string().optional(),
      state: z.string().optional(),
      estimate: z.number().optional(),
      priority: z.string().optional(),
    },
    async ({ id, name, description, state, estimate, priority }, context) => {
      try {
        // Access the progress update function
        const sendProgressUpdate = (server as any).sendProgressUpdate;
        
        // Send initial progress update
        if (sendProgressUpdate) {
          sendProgressUpdate('updateStory', 10, 'Preparing story update data');
        }
        
        // Create update data object with only the fields that are provided
        const updateData: any = {};
        
        if (name !== undefined) updateData.Name = name;
        if (description !== undefined) updateData.Description = description;
        if (state !== undefined) updateData.ScheduleState = state;
        if (estimate !== undefined) updateData.PlanEstimate = estimate;
        if (priority !== undefined) updateData.Priority = priority;

        // Check if any data was provided to update
        if (Object.keys(updateData).length === 0) {
          return {
            content: [
              { 
                type: 'text', 
                text: 'No fields provided for update. Story was not modified.' 
              }
            ],
            isError: true
          };
        }
        
        // Send progress update before API call
        if (sendProgressUpdate) {
          sendProgressUpdate('updateStory', 50, 'Sending update request to Rally API');
        }

        // Update the story using the Rally client with timeout handling
        const result = await Promise.race([
          rallyClient.updateStory(id, updateData),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Story update timed out after 30 seconds')), 30000))
        ]);
        
        // Send completion progress update
        if (sendProgressUpdate) {
          sendProgressUpdate('updateStory', 100, 'Story updated successfully');
        }

        return {
          content: [
            { 
              type: 'text', 
              text: `Successfully updated story ${id}` 
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            { 
              type: 'text', 
              text: `Error updating story: ${(error as Error).message}` 
            }
          ],
          isError: true
        };
      }
    }
  );

  // Delete Story Tool
  server.tool(
    'deleteStory',
    {
      id: z.string().min(1, "Story ID is required"),
    },
    async ({ id }) => {
      try {
        // Delete the story
        await rallyClient.deleteStory(id);

        return {
          content: [
            { 
              type: 'text', 
              text: `Successfully deleted story ${id}` 
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            { 
              type: 'text', 
              text: `Error deleting story: ${(error as Error).message}` 
            }
          ],
          isError: true
        };
      }
    }
  );

  // Create Relationship Tool
  server.tool(
    'createRelationship',
    {
      sourceId: z.string().min(1, "Source ID is required"),
      targetId: z.string().min(1, "Target ID is required"),
      relationshipType: z.enum([
        'Predecessor', 
        'Successor', 
        'Parent', 
        'Child', 
        'Blocker', 
        'Blocked',
        'Duplicate',
        'Duplicated'
      ], { 
        errorMap: () => ({ 
          message: "Relationship type must be one of: Predecessor, Successor, Parent, Child, Blocker, Blocked, Duplicate, Duplicated" 
        })
      })
    },
    async ({ sourceId, targetId, relationshipType }) => {
      try {
        // Validate that sourceId and targetId are not the same
        if (sourceId === targetId) {
          return {
            content: [
              { 
                type: 'text', 
                text: 'Source and target cannot be the same artifact.' 
              }
            ],
            isError: true
          };
        }

        // Create the relationship
        await rallyClient.createRelationship(
          sourceId, 
          targetId, 
          relationshipType as RelationshipType
        );

        return {
          content: [
            { 
              type: 'text', 
              text: `Successfully created ${relationshipType} relationship from ${sourceId} to ${targetId}` 
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            { 
              type: 'text', 
              text: `Error creating relationship: ${(error as Error).message}` 
            }
          ],
          isError: true
        };
      }
    }
  );

  // Remove Relationship Tool
  server.tool(
    'removeRelationship',
    {
      sourceId: z.string().min(1, "Source ID is required"),
      targetId: z.string().min(1, "Target ID is required"),
      relationshipType: z.enum([
        'Predecessor', 
        'Successor', 
        'Parent', 
        'Child', 
        'Blocker', 
        'Blocked',
        'Duplicate',
        'Duplicated'
      ], { 
        errorMap: () => ({ 
          message: "Relationship type must be one of: Predecessor, Successor, Parent, Child, Blocker, Blocked, Duplicate, Duplicated" 
        })
      })
    },
    async ({ sourceId, targetId, relationshipType }) => {
      try {
        // Remove the relationship
        await rallyClient.removeRelationship(
          sourceId, 
          targetId, 
          relationshipType as RelationshipType
        );

        return {
          content: [
            { 
              type: 'text', 
              text: `Successfully removed ${relationshipType} relationship from ${sourceId} to ${targetId}` 
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            { 
              type: 'text', 
              text: `Error removing relationship: ${(error as Error).message}` 
            }
          ],
          isError: true
        };
      }
    }
  );

  // Get Relationships Tool
  server.tool(
    'getRelationships',
    {
      artifactId: z.string().min(1, "Artifact ID is required")
    },
    async ({ artifactId }) => {
      try {
        // Get the relationships
        const result = await rallyClient.getRelationships(artifactId);
        
        // Format the result for display
        const artifact = result.HierarchicalRequirement || {};
        const relationships: Record<string, any> = {};
        
        // Extract each relationship type
        if (artifact.Predecessors) {
          relationships.Predecessors = artifact.Predecessors._tagsNameArray || [];
        }
        
        if (artifact.Successors) {
          relationships.Successors = artifact.Successors._tagsNameArray || [];
        }
        
        if (artifact.Children) {
          relationships.Children = artifact.Children._tagsNameArray || [];
        }
        
        if (artifact.Parent) {
          relationships.Parent = artifact.Parent._refObjectName;
        }
        
        if (artifact.Blocked) {
          relationships.Blocked = artifact.Blocked._tagsNameArray || [];
        }
        
        if (artifact.Blocker) {
          relationships.Blocker = artifact.Blocker._tagsNameArray || [];
        }
        
        if (artifact.Duplicates) {
          relationships.Duplicates = artifact.Duplicates._tagsNameArray || [];
        }

        return {
          content: [
            { 
              type: 'text', 
              text: `Relationships for ${artifactId}:\n${JSON.stringify(relationships, null, 2)}` 
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            { 
              type: 'text', 
              text: `Error getting relationships: ${(error as Error).message}` 
            }
          ],
          isError: true
        };
      }
    }
  );

  console.log('Tool handlers registered');
}