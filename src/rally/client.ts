import axios, { AxiosInstance } from 'axios';
import { Config } from '../config';

export interface RallyStory {
  ObjectID: number;
  FormattedID: string;
  Name: string;
  Description?: string;
  Project?: { _ref: string };
  [key: string]: any; // Allow additional Rally fields
}

export interface RallyCreateResponse {
  CreateResult: {
    Object: RallyStory;
  };
}

export type RelationshipType = 
  | 'Predecessor' 
  | 'Successor'
  | 'Child' 
  | 'Parent'
  | 'Blocker'
  | 'Blocked'
  | 'Duplicate'
  | 'Duplicated';

export class RallyClient {
  private client: AxiosInstance;
  private workspace: string;
  private workspaceRef?: string;
  private project?: string;
  private workspaceIsNumeric: boolean;
  
  constructor(config: Config) {
    this.client = axios.create({
      baseURL: 'https://rally1.rallydev.com/slm/webservice/v2.0',
      headers: {
        'ZSESSIONID': config.rallyApiKey
      },
      timeout: 60000 // Set a global timeout for all requests (60 seconds)
    });
    this.workspace = config.rallyWorkspace;
    this.project = config.rallyProject;
    
    // Check if workspace is numeric (ObjectID) or name
    this.workspaceIsNumeric = /^\d+$/.test(this.workspace);
  }
  
  /**
   * Validates the API credentials by making a test request
   * @returns A promise that resolves to a validation result
   */
  async validateCredentials(): Promise<{ valid: boolean; error?: string }> {
    try {
      console.log('Validating Rally API credentials...');
      
      // Try to fetch subscription info with timeout
      const response = await Promise.race([
        this.client.get('/subscription'),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Subscription request timed out after 30 seconds')), 30000)
        )
      ]);
      
      if (response.status === 200 && response.data) {
        console.log('Rally API key is valid, checking workspace access...');
        
        // Now verify the workspace with timeout
        try {
          // Use different query based on whether workspace is ID or name
          const workspaceQuery = this.workspaceIsNumeric 
            ? `(ObjectID = ${this.workspace})`
            : `(Name = "${this.workspace}")`;
          
          const workspaceCheck = await Promise.race([
            this.client.get('/workspace', {
              params: {
                query: workspaceQuery
              }
            }),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Workspace request timed out after 30 seconds')), 30000)
            )
          ]);
          
          // Check if the workspace was found
          if (workspaceCheck.data && 
              workspaceCheck.data.QueryResult && 
              workspaceCheck.data.QueryResult.Results && 
              workspaceCheck.data.QueryResult.Results.length > 0) {
            
            // Found the workspace
            const workspace = workspaceCheck.data.QueryResult.Results[0];
            console.log(`Workspace access confirmed: ${workspace.Name} (${workspace.ObjectID})`);
            
            // Save the workspace reference
            this.workspaceRef = `/workspace/${workspace.ObjectID}`;
            return { valid: true };
          } else {
            // Workspace not found by name/ID, try to list workspaces
            console.log('Workspace not found by exact name/ID, trying to list available workspaces...');
            
            const workspaceList = await Promise.race([
              this.client.get('/workspace'),
              new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('Workspace listing timed out after 30 seconds')), 30000)
              )
            ]);
            
            if (workspaceList.data && 
                workspaceList.data.QueryResult && 
                workspaceList.data.QueryResult.Results && 
                workspaceList.data.QueryResult.Results.length > 0) {
              
              // Found some workspaces
              console.log(`Found ${workspaceList.data.QueryResult.Results.length} accessible workspaces`);
              
              // Try to find one that matches or contains the name
              if (!this.workspaceIsNumeric && this.workspace) {
                const matchingWorkspace = workspaceList.data.QueryResult.Results.find((w: any) => 
                  w.Name && w.Name.toLowerCase().includes(this.workspace.toLowerCase()));
                
                if (matchingWorkspace) {
                  console.log(`Found matching workspace: ${matchingWorkspace.Name} (${matchingWorkspace.ObjectID})`);
                  this.workspaceRef = `/workspace/${matchingWorkspace.ObjectID}`;
                  return { valid: true };
                }
              }
              
              // Add this after finding the workspaces
              const workspaces = workspaceList.data.QueryResult.Results;
              console.log('Available workspaces:');
              workspaces.forEach((ws: any, index: number) => {
                console.log(`  [${index}] ID: ${ws.ObjectID}, Name: ${ws.Name}, Ref: ${ws._ref}`);
              });
              
              // If we can't find a match but have at least one workspace, use the first one
              const firstWorkspace = workspaces[0];
              console.log(`Using first available workspace:`, JSON.stringify(firstWorkspace, null, 2));
              // Extract the ObjectID from the _ref if it's not directly available
              let workspaceId = firstWorkspace.ObjectID;
              if (!workspaceId && firstWorkspace._ref) {
                const refMatch = firstWorkspace._ref.match(/\/workspace\/(\d+)/);
                if (refMatch && refMatch[1]) {
                  workspaceId = refMatch[1];
                }
              }
              this.workspaceRef = `/workspace/${workspaceId}`;
              
              return { 
                valid: true,
                error: `Specified workspace "${this.workspace}" not found, using "${firstWorkspace.Name}" (${workspaceId}) instead`
              };
            } else if (workspaceList.data && 
                       workspaceList.data.QueryResult && 
                       workspaceList.data.QueryResult.Errors && 
                       workspaceList.data.QueryResult.Errors.length > 0) {
              
              // There were specific errors with listing workspaces
              const errors = workspaceList.data.QueryResult.Errors.join('; ');
              console.error(`Workspace listing failed: ${errors}`);
              return { 
                valid: false, 
                error: `Workspace listing failed: ${errors}` 
              };
            } else {
              // No workspaces found at all
              console.error('No accessible workspaces found');
              return { 
                valid: false, 
                error: 'No accessible workspaces found with this API key' 
              };
            }
          }
        } catch (workspaceError: any) {
          console.error('Error checking workspace:', workspaceError);
          return { 
            valid: false, 
            error: `Error checking workspace: ${workspaceError.message}` 
          };
        }
      } else {
        console.error('Unexpected response from Rally API', response.status);
        return { 
          valid: false, 
          error: `Unexpected response from Rally API: ${response.status}` 
        };
      }
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          if (error.response.status === 401) {
            console.error('Rally API authentication failed - invalid API key');
            return { 
              valid: false, 
              error: 'Authentication failed - invalid API key' 
            };
          } else {
            console.error(`Rally API request failed with status ${error.response.status}`);
            return { 
              valid: false, 
              error: `Request failed with status ${error.response.status}: ${error.message}` 
            };
          }
        } else if (error.request) {
          console.error('Rally API server did not respond');
          return { 
            valid: false, 
            error: 'No response from Rally API server - network issue or service unavailable' 
          };
        }
      }
      
      console.error('Failed to validate Rally API credentials:', error);
      return { 
        valid: false, 
        error: `Failed to validate credentials: ${error.message}` 
      };
    }
  }
  
  // Stories (User Stories in Rally)
  async getStories(queryParams: Record<string, string> = {}) {
    try {
      // Check if we need to initialize
      if (!this.workspaceRef) {
        await this.validateCredentials();
      }
      
      const response = await this.client.get('/HierarchicalRequirement', {
        params: {
          workspace: this.workspaceRef,
          project: this.project ? `/project/${this.project}` : undefined,
          ...queryParams
        }
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch stories: ${error.message}`);
      }
      throw error;
    }
  }
  
  async getStory(id: string) {
    try {
      // Check if we need to initialize
      if (!this.workspaceRef) {
        await this.validateCredentials();
      }
      
      const response = await this.client.get(`/HierarchicalRequirement/${id}`, {
        params: {
          workspace: this.workspaceRef,
          project: this.project ? `/project/${this.project}` : undefined
        }
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch story ${id}: ${error.message}`);
      }
      throw error;
    }
  }
  
  async createStory(data: { 
    Name: string;
    Description?: string;
    Project?: { _ref: string };
    [key: string]: any;
  }) {
    try {
      // Check if we need to initialize
      if (!this.workspaceRef) {
        await this.validateCredentials();
      }
      
      const response = await this.client.post<RallyCreateResponse>('/HierarchicalRequirement/create', {
        HierarchicalRequirement: {
          ...data,
          Workspace: { _ref: this.workspaceRef },
          Project: data.Project || (this.project ? { _ref: `/project/${this.project}` } : undefined)
        }
      });
      return response.data.CreateResult.Object;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to create story: ${error.message}`);
      }
      throw error;
    }
  }
  
  async updateStory(id: string, data: Partial<RallyStory>) {
    try {
      // Check if we need to initialize
      if (!this.workspaceRef) {
        await this.validateCredentials();
      }
      
      const response = await this.client.post(`/HierarchicalRequirement/${id}`, {
        HierarchicalRequirement: data
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to update story ${id}: ${error.message}`);
      }
      throw error;
    }
  }
  
  async deleteStory(id: string) {
    try {
      // Check if we need to initialize
      if (!this.workspaceRef) {
        await this.validateCredentials();
      }
      
      const response = await this.client.delete(`/HierarchicalRequirement/${id}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to delete story ${id}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get relationships for an artifact
   * @param artifactId The ID of the artifact to get relationships for
   * @returns Promise resolving to the relationships data
   */
  async getRelationships(artifactId: string) {
    try {
      // Check if we need to initialize
      if (!this.workspaceRef) {
        await this.validateCredentials();
      }
      
      const response = await this.client.get(`/HierarchicalRequirement/${artifactId}`, {
        params: {
          fetch: 'Predecessors,Successors,Children,Parent,Blocked,Blocker,Duplicates',
          workspace: this.workspaceRef
        }
      });
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to get relationships for ${artifactId}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Create a relationship between two artifacts
   * @param sourceId The ID of the source artifact
   * @param targetId The ID of the target artifact
   * @param relationshipType The type of relationship to create
   * @returns Promise resolving to the created relationship
   */
  async createRelationship(sourceId: string, targetId: string, relationshipType: RelationshipType) {
    try {
      // Check if we need to initialize
      if (!this.workspaceRef) {
        await this.validateCredentials();
      }
      
      // Determine which collection to update based on relationship type
      let collectionName: string;
      let artifactType = 'HierarchicalRequirement'; // Default to UserStory

      // Map relationship type to the appropriate collection
      switch (relationshipType) {
        case 'Predecessor':
          collectionName = 'Predecessors';
          break;
        case 'Successor':
          collectionName = 'Successors';
          break;
        case 'Parent':
          collectionName = 'Parent';
          break;
        case 'Child':
          collectionName = 'Children';
          break;
        case 'Blocker':
          collectionName = 'Blockers';
          break;
        case 'Blocked':
          collectionName = 'Blocked';
          break;
        case 'Duplicate':
          collectionName = 'Duplicates';
          break;
        case 'Duplicated':
          collectionName = 'Duplicated';
          break;
        default:
          throw new Error(`Unsupported relationship type: ${relationshipType}`);
      }

      // Check if we're adding a single item or to a collection
      const isSingleReference = ['Parent'].includes(collectionName);
      
      let updateData: any;
      if (isSingleReference) {
        // For single references like Parent
        updateData = {
          [artifactType]: {
            [collectionName]: { _ref: `/${artifactType}/${targetId}` }
          }
        };
      } else {
        // For collection references like Predecessors
        updateData = {
          [artifactType]: {
            [`${collectionName}`]: {
              _type: 'add',
              _ref: `/${artifactType}/${targetId}`
            }
          }
        };
      }
      
      const response = await this.client.post(`/${artifactType}/${sourceId}`, updateData);
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to create relationship: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Remove a relationship between two artifacts
   * @param sourceId The ID of the source artifact
   * @param targetId The ID of the target artifact
   * @param relationshipType The type of relationship to remove
   * @returns Promise resolving to the operation result
   */
  async removeRelationship(sourceId: string, targetId: string, relationshipType: RelationshipType) {
    try {
      // Check if we need to initialize
      if (!this.workspaceRef) {
        await this.validateCredentials();
      }
      
      // Determine which collection to update based on relationship type
      let collectionName: string;
      let artifactType = 'HierarchicalRequirement'; // Default to UserStory

      // Map relationship type to the appropriate collection
      switch (relationshipType) {
        case 'Predecessor':
          collectionName = 'Predecessors';
          break;
        case 'Successor':
          collectionName = 'Successors';
          break;
        case 'Parent':
          collectionName = 'Parent';
          break;
        case 'Child':
          collectionName = 'Children';
          break;
        case 'Blocker':
          collectionName = 'Blockers';
          break;
        case 'Blocked':
          collectionName = 'Blocked';
          break;
        case 'Duplicate':
          collectionName = 'Duplicates';
          break;
        case 'Duplicated':
          collectionName = 'Duplicated';
          break;
        default:
          throw new Error(`Unsupported relationship type: ${relationshipType}`);
      }

      // Check if we're removing a single item or from a collection
      const isSingleReference = ['Parent'].includes(collectionName);
      
      let updateData: any;
      if (isSingleReference) {
        // For single references like Parent, set to null to remove
        updateData = {
          [artifactType]: {
            [collectionName]: null
          }
        };
      } else {
        // For collection references like Predecessors
        updateData = {
          [artifactType]: {
            [`${collectionName}`]: {
              _type: 'remove',
              _ref: `/${artifactType}/${targetId}`
            }
          }
        };
      }
      
      const response = await this.client.post(`/${artifactType}/${sourceId}`, updateData);
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to remove relationship: ${error.message}`);
      }
      throw error;
    }
  }
}