# mcp-rally-server Development Tasks

This document provides a sequential roadmap for developing the mcp-rally-server using Cursor. It breaks down the implementation into logical, ordered tasks with clear dependencies and completion criteria. Follow these tasks in order to ensure a smooth development process with properly tested components.

## How to Use This Guide

1. Complete each task in the order presented
2. For each task:
   - Read the implementation guidance
   - Check any referenced documentation
   - Follow testing requirements
   - Verify the done criteria before moving on
3. Compile and run tests at key checkpoints

## Development Phases

1. **Project Setup and Foundation** - Create project structure and core components
2. **Resource Implementation** - Implement read-only resources for Rally artifacts
3. **Tool Implementation** - Implement write operations to modify Rally data
4. **Comprehensive Testing** - Ensure high-quality with thorough testing
5. **Deployment and Documentation** - Prepare for production use

## Phase 1: Project Setup and Foundation

### ✅ Task 1: Initialize TypeScript project with proper configuration

**Implementation Guidance:**

- Reference Architecture.md for the recommended project structure
- Set up project:
  ```bash
  mkdir mcp-rally-server
  cd mcp-rally-server
  npm init -y
  ```
- Install dependencies:
  ```bash
  npm install @modelcontextprotocol/sdk zod axios dotenv
  npm install --save-dev typescript ts-node @types/node jest ts-jest @types/jest eslint prettier
  ```
- Create TypeScript configuration file (tsconfig.json):
  ```json
  {
    "compilerOptions": {
      "target": "ES2020",
      "module": "CommonJS",
      "lib": ["ES2020"],
      "outDir": "./dist",
      "rootDir": "./src",
      "strict": true,
      "esModuleInterop": true,
      "forceConsistentCasingInFileNames": true,
      "moduleResolution": "node",
      "resolveJsonModule": true
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "**/*.test.ts"]
  }
  ```
- Add scripts to package.json:
  ```json
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "lint": "eslint . --ext .ts",
    "format": "prettier --write \"src/**/*.ts\"",
    "test": "jest"
  }
  ```
- Create basic directory structure:
  ```
  src/
  ├── index.ts
  ├── config.ts
  ├── rally/
  │   └── client.ts
  ├── handlers/
  │   ├── resources.ts
  │   └── tools.ts
  └── utils.ts
  ```

**Testing Requirements:**

- Create a simple test to verify Jest is set up correctly

**Done Criteria:**

- ✅ Project compiles with `npm run build`
- ✅ Linting passes with `npm run lint`
- ✅ Test environment works with `npm test`

**Completion Date:** May 3, 2024

### ✅ Task 2: Implement configuration management

**Implementation Guidance:**

- Create simple configuration module in `src/config.ts`:

  ```typescript
  // src/config.ts
  import dotenv from 'dotenv';
  import { z } from 'zod';

  dotenv.config();

  export const configSchema = z.object({
    rallyApiKey: z.string().min(1),
    rallyWorkspace: z.string().min(1),
    rallyProject: z.string().optional(),
    port: z.coerce.number().int().positive().default(3000),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  });

  export type Config = z.infer<typeof configSchema>;

  export function loadConfig(): Config {
    return configSchema.parse({
      rallyApiKey: process.env.RALLY_API_KEY,
      rallyWorkspace: process.env.RALLY_WORKSPACE,
      rallyProject: process.env.RALLY_PROJECT,
      port: process.env.PORT,
      logLevel: process.env.LOG_LEVEL,
    });
  }
  ```

**Testing Requirements:**

- Write tests for configuration loading
- Test validation of required fields

**Done Criteria:**

- ✅ Configuration successfully loads from environment variables
- ✅ Validation correctly identifies missing required fields
- ✅ All tests pass

**Completion Date:** May 3, 2024

### ✅ Task 3: Implement Rally API client

**Implementation Guidance:**

- Create a minimal Rally API client in `src/rally/client.ts`:

  ```typescript
  // src/rally/client.ts
  import axios, { AxiosInstance } from 'axios';
  import { Config } from '../config';

  export class RallyClient {
    private client: AxiosInstance;
    private workspace: string;
    private project?: string;

    constructor(config: Config) {
      this.client = axios.create({
        baseURL: 'https://rally1.rallydev.com/slm/webservice/v2.0',
        headers: {
          ZSESSIONID: config.rallyApiKey,
        },
      });
      this.workspace = config.rallyWorkspace;
      this.project = config.rallyProject;
    }

    // Stories (User Stories in Rally)
    async getStories() {
      const response = await this.client.get('/HierarchicalRequirement', {
        params: {
          workspace: `/workspace/${this.workspace}`,
          project: this.project ? `/project/${this.project}` : undefined,
        },
      });
      return response.data;
    }

    async getStory(id: string) {
      const response = await this.client.get(`/HierarchicalRequirement/${id}`, {
        params: {
          workspace: `/workspace/${this.workspace}`,
          project: this.project ? `/project/${this.project}` : undefined,
        },
      });
      return response.data;
    }

    // Add methods for tasks, defects, etc.
    // Add methods for create, update, delete operations
  }
  ```

**Testing Requirements:**

- Write unit tests with mocked axios responses
- Test basic CRUD operations

**Done Criteria:**

- ✅ Client can make requests to Rally API
- ✅ Error handling works as expected
- ✅ All tests pass

**Completion Date:** May 3, 2024

### ✅ Task 4: Create MCP server with transports

**Implementation Guidance:**

- Create a simplified server setup in `src/index.ts` using the MCP SDK directly:

  ```typescript
  // src/index.ts
  import { createServer } from '@modelcontextprotocol/sdk/server';
  import { loadConfig } from './config';
  import { RallyClient } from './rally/client';
  import { registerResources } from './handlers/resources';
  import { registerTools } from './handlers/tools';

  async function main() {
    try {
      // Load config and create Rally client
      const config = loadConfig();
      const rallyClient = new RallyClient(config);

      // Create MCP server
      const server = createServer({
        name: 'mcp-rally-server',
        version: '1.0.0',
      });

      // Register handlers
      registerResources(server, rallyClient);
      registerTools(server, rallyClient);

      // Start server with appropriate transport
      const useHttp = process.argv.includes('--http');
      if (useHttp) {
        await server.listen({
          type: 'http',
          port: config.port,
          path: '/mcp',
        });
        console.log(`HTTP server listening on port ${config.port}`);
      } else {
        await server.listen({ type: 'stdio' });
        console.error('STDIO server started');
      }
    } catch (error) {
      console.error('Server failed to start:', error);
      process.exit(1);
    }
  }

  main();
  ```

**Testing Requirements:**

- Create a smoke test that initializes the server
- Test both transport options

**Done Criteria:**

- ✅ Server starts successfully with both transports
- ✅ Smoke test passes

**Completion Date:** May 3, 2024

## Phase 2: Resource Implementation

### ✅ Task 5: Implement resource handlers

**Implementation Guidance:**

- Create resource handlers in `src/handlers/resources.ts`:

  ```typescript
  // src/handlers/resources.ts
  import { MCP, Server } from '@modelcontextprotocol/sdk/server';
  import { RallyClient } from '../rally/client';

  export function registerResources(server: Server, rallyClient: RallyClient) {
    // List stories
    server.resource('stories', 'rally://stories', async () => {
      try {
        const data = await rallyClient.getStories();
        return {
          contents: data.Results.map((story: any) => ({
            uri: `rally://story/${story.ObjectID}`,
            text: JSON.stringify(story),
          })),
        };
      } catch (error: any) {
        return {
          isError: true,
          errorMessage: `Failed to fetch stories: ${error.message}`,
        };
      }
    });

    // Single story
    server.resource('story', 'rally://story/:id', async (uri) => {
      try {
        const id = uri.split('/').pop();
        const data = await rallyClient.getStory(id!);
        return {
          contents: [
            {
              uri: `rally://story/${data.ObjectID}`,
              text: JSON.stringify(data),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          errorMessage: `Failed to fetch story: ${error.message}`,
        };
      }
    });

    // Add additional resources for tasks, defects, etc.
  }
  ```

**Testing Requirements:**

- Write tests for resource handlers
- Test error handling
- Test with mocked Rally API responses

**Done Criteria:**

- ✅ Resources return correctly formatted data
- ✅ Error handling works as expected
- ✅ All tests pass

**Completion Date:** June 25, 2024

### ✅ Task 6: Implement resource filtering and pagination

**Implementation Guidance:**

- Enhance resource handlers to support filtering and pagination:

  ```typescript
  // Add to src/handlers/resources.ts
  server.resource('stories', 'rally://stories', async (uri) => {
    try {
      const url = new URL(uri);
      const query: Record<string, string> = {};

      // Extract query parameters
      url.searchParams.forEach((value, key) => {
        query[key] = value;
      });

      // Use query parameters in the request
      const data = await rallyClient.getStories(query);

      return {
        contents: data.Results.map((story: any) => ({
          uri: `rally://story/${story.ObjectID}`,
          text: JSON.stringify(story),
        })),
      };
    } catch (error: any) {
      return {
        isError: true,
        errorMessage: `Failed to fetch stories: ${error.message}`,
      };
    }
  });
  ```

**Testing Requirements:**

- Test query parameter handling
- Test pagination support
- Test error scenarios

**Done Criteria:**

- ✅ Filtering works correctly
- ✅ Pagination works correctly
- ✅ All tests pass

**Completion Date:** June 25, 2024

## Phase 3: Tool Implementation

### ✅ Task 7: Implement basic tool handlers

**Implementation Guidance:**

- Create tool handlers in `src/handlers/tools.ts`:

  ```typescript
  // src/handlers/tools.ts
  import { MCP, Server } from '@modelcontextprotocol/sdk/server';
  import { z } from 'zod';
  import { RallyClient } from '../rally/client';

  export function registerTools(server: Server, rallyClient: RallyClient) {
    // Create story tool
    server.tool(
      'createStory',
      {
        name: z.string().min(1),
        description: z.string().optional(),
        projectId: z.string().optional(),
      },
      async ({ name, description, projectId }) => {
        try {
          const result = await rallyClient.createStory({
            Name: name,
            Description: description,
            Project: projectId ? { _ref: `/project/${projectId}` } : undefined,
          });

          return {
            content: [{ type: 'text', text: `Created story: ${result.FormattedID}` }],
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Error creating story: ${error.message}` }],
          };
        }
      },
    );

    // Add additional tools for updating, deleting, etc.
  }
  ```

**Testing Requirements:**

- Write tests for tool handlers
- Test parameter validation
- Test error handling

**Done Criteria:**

- ✅ Tools successfully execute actions against the Rally API
- ✅ Parameter validation works correctly
- ✅ Error handling works as expected
- ✅ All tests pass

**Completion Date:** June 27, 2024

### ✅ Task 8: Implement updating and deleting

**Implementation Guidance:**

- Add tools for updating and deleting Rally artifacts:

  ```typescript
  // Add to src/handlers/tools.ts

  // Update story tool
  server.tool(
    'updateStory',
    {
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      state: z.string().optional(),
    },
    async ({ id, name, description, state }) => {
      try {
        // Implementation
      } catch (error: any) {
        // Error handling
      }
    },
  );

  // Delete story tool
  server.tool(
    'deleteStory',
    {
      id: z.string(),
    },
    async ({ id }) => {
      try {
        // Implementation
      } catch (error: any) {
        // Error handling
      }
    },
  );
  ```

**Testing Requirements:**

- Write tests for update tools
- Write tests for delete tools
- Test parameter validation
- Test error handling

**Done Criteria:**

- ✅ Tools successfully execute update and delete operations
- ✅ Parameter validation works correctly
- ✅ Error handling works as expected
- ✅ All tests pass

**Completion Date:** June 27, 2024

### ✅ Task 9: Implement relationship tools

**Implementation Guidance:**

- Add tools for linking artifacts and managing relationships:

  ```typescript
  // Add to src/handlers/tools.ts

  // Link artifacts tool
  server.tool(
    'createRelationship',
    {
      sourceId: z.string(),
      targetId: z.string(),
      relationshipType: z.string(),
    },
    async ({ sourceId, targetId, relationshipType }) => {
      try {
        // Implementation
      } catch (error: any) {
        // Error handling
      }
    },
  );
  ```

**Testing Requirements:**

- Write tests for relationship tools
- Test parameter validation
- Test error handling

**Done Criteria:**

- ✅ Tools successfully manage relationships between artifacts
- ✅ Parameter validation works correctly
- ✅ Error handling works as expected
- ✅ All tests pass

**Completion Date:** June 27, 2024

## Phase 4: Comprehensive Testing and Refinement

### Task 10: Implement end-to-end tests

**Implementation Guidance:**

- Create end-to-end tests that verify the entire workflow:

  ```typescript
  // test/e2e.test.ts
  import { createClient } from '@modelcontextprotocol/sdk/client';

  describe('MCP Rally Server E2E Tests', () => {
    let client: any;

    beforeAll(async () => {
      // Connect to test server
      client = createClient();
      await client.connect({ type: 'http', url: 'http://localhost:3000/mcp' });
    });

    afterAll(async () => {
      await client.disconnect();
    });

    test('List stories', async () => {
      const result = await client.readResource({ uri: 'rally://stories' });
      expect(result.contents).toBeDefined();
      expect(Array.isArray(result.contents)).toBe(true);
    });

    // Additional tests for other resources and tools
  });
  ```

**Testing Requirements:**

- Test full workflow from client connection to tool execution
- Test with both STDIO and HTTP transports
- Test error scenarios and edge cases

**Done Criteria:**

- End-to-end tests pass with both transports
- All main workflows work as expected

### Task 11: Ensure test coverage meets standards

**Implementation Guidance:**

- Add Jest coverage configuration
- Run coverage analysis
- Add tests for uncovered code

**Testing Requirements:**

- Achieve at least 80% test coverage
- Document any excluded areas

**Done Criteria:**

- Test coverage meets or exceeds 80%
- Coverage report shows no critical uncovered areas

## Phase 5: Deployment and Documentation

### Task 12: Create Docker configuration

**Implementation Guidance:**

- Create a simple Dockerfile:

  ```Dockerfile
  FROM node:18-alpine

  WORKDIR /app

  COPY package*.json ./
  RUN npm ci --only=production

  COPY dist/ ./dist/

  ENV NODE_ENV=production

  EXPOSE 3000

  CMD ["node", "dist/index.js", "--http"]
  ```

**Testing Requirements:**

- Verify the Docker image builds correctly
- Test running the server in a container

**Done Criteria:**

- Docker deployment works as expected
- Documentation covers Docker usage

### Task 13: Document API and usage

**Implementation Guidance:**

- Create comprehensive README.md with usage examples
- Document all resources and tools

**Testing Requirements:**

- Verify documentation accuracy
- Test examples

**Done Criteria:**

- Documentation is comprehensive and accurate
- Examples work as described

## Conclusion

Following this sequential task list will result in a fully functional mcp-rally-server that meets all the requirements specified in the project documentation. The implementation follows the simplicity and patterns found in reference MCP server implementations, using the SDK directly without unnecessary complexity.

function createErrorResponse(message: string) {
return {
content: [{ type: 'text', text: message }],
isError: true
};
}
