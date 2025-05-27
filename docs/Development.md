# mcp-rally-server Development Guide

This guide provides information for developers working on the mcp-rally-server project. It covers setup, workflow, code standards, testing, and contribution guidelines.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Environment](#development-environment)
3. [Project Structure](#project-structure)
4. [Development Workflow](#development-workflow)
5. [Code Standards](#code-standards)
6. [Testing](#testing)
7. [Debugging](#debugging)
8. [Deployment](#deployment)
9. [Contributing](#contributing)

## Getting Started

### Prerequisites

To work on mcp-rally-server, you'll need:

- Node.js (v16+)
- npm (v8+)
- TypeScript (v4.7+)
- A Rally account with API access
- Git

### Installation

1. Clone the repository:

```bash
git clone https://github.com/your-org/mcp-rally-server.git
cd mcp-rally-server
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file for local development:

```
RALLY_API_KEY=your_api_key
RALLY_WORKSPACE=your_workspace
RALLY_PROJECT=your_project
LOG_LEVEL=debug
```

4. Build the project:

```bash
npm run build
```

## Development Environment

### Recommended Tools

- **IDE**: VS Code with the following extensions:

  - ESLint
  - Prettier
  - TypeScript Hero
  - Mermaid Preview

- **Debugging**: Node.js debugger integrated with VS Code
- **API Testing**: Postman or Insomnia for HTTP transport testing

### Development Scripts

The package.json includes the following scripts:

- `npm run build`: Compile TypeScript to JavaScript
- `npm run clean`: Remove build artifacts
- `npm run lint`: Run ESLint
- `npm run format`: Run Prettier code formatter
- `npm run dev`: Run with hot reload for development
- `npm run test`: Run unit tests
- `npm run test:integration`: Run integration tests
- `npm run test:e2e`: Run end-to-end tests

## Project Structure

Following the architecture document, the project is organized with a simplified structure:

```
mcp-rally-server/
├── .github/                # GitHub workflow configurations
├── docs/                   # Documentation files
├── src/                    # Source code
│   ├── index.ts            # Entry point and server setup
│   ├── config.ts           # Configuration management
│   ├── rally/              # Rally API client
│   │   └── client.ts       # Rally client implementation
│   ├── handlers/           # MCP handlers
│   │   ├── resources.ts    # Resource handlers
│   │   └── tools.ts        # Tool handlers
│   └── utils.ts            # Utility functions
├── test/                   # Test files
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── e2e/                # End-to-end tests
├── dist/                   # Compiled output (git-ignored)
├── .env.example            # Example environment variables
├── .eslintrc.js            # ESLint configuration
├── .prettierrc             # Prettier configuration
├── tsconfig.json           # TypeScript configuration
├── jest.config.js          # Jest configuration
└── package.json            # npm package configuration
```

This simplified structure follows the patterns used in reference MCP server implementations like those from GitHub, Google Maps, and Slack. It makes the codebase easier to navigate and maintain while still providing a clean separation of concerns.

## Development Workflow

### Feature Development

1. **Create a branch**: Create a feature branch from `main` using the naming convention `feature/name-of-feature` or `fix/issue-description`.

2. **Implement and test**: Develop your feature following the architecture and code standards. Write tests to cover your changes.

3. **Update documentation**: Update relevant documentation, including JSDoc comments and any external docs.

4. **Commit changes**: Use semantic commit messages:

   ```
   feat: add story resource template
   fix: handle authentication errors properly
   docs: update resource documentation
   refactor: improve error handling
   test: add unit tests for rally client
   ```

5. **Pull Request**: Submit a PR to `main` with a clear description of the changes and any relevant issue numbers.

### Branch Strategy

We follow a simplified Git workflow:

- `main`: Stable branch, always deployable
- `feature/*`: For new features
- `fix/*`: For bug fixes
- `docs/*`: For documentation-only changes
- `refactor/*`: For code refactoring without feature changes

## Code Standards

### TypeScript Guidelines

- Use TypeScript's strict mode
- Prefer interfaces over types when defining object shapes
- Use explicit typing, avoid `any` wherever possible
- Use readonly modifiers for immutable properties
- Leverage generics for reusable components

### Functional Programming

As specified in the architecture, we follow functional programming principles:

- Prefer pure functions
- Use immutable data structures
- Leverage function composition
- Use Result types for error handling

Example:

```typescript
// Prefer this (functional)
function transformData(data: RallyData[]): ResourceContent[] {
  return data.map((item) => ({
    uri: `rally://story/${item.ObjectID}`,
    text: JSON.stringify(item),
  }));
}

// Over this (imperative)
function transformData(data: RallyData[]): ResourceContent[] {
  const result: ResourceContent[] = [];
  for (let i = 0; i < data.length; i++) {
    result.push({
      uri: `rally://story/${data[i].ObjectID}`,
      text: JSON.stringify(data[i]),
    });
  }
  return result;
}
```

### Formatting and Linting

- We use ESLint and Prettier for code quality and formatting
- Code must pass linting before being merged
- Configure your editor to format on save for the best workflow

### Documentation

- All exported functions must have JSDoc comments
- Document complex algorithms with inline comments
- Keep README, Architecture Guide, and other docs updated

## Testing

Our testing strategy follows a comprehensive approach:

### Unit Testing

Unit tests focus on testing individual modules in isolation:

```typescript
// Example unit test for a tool handler
describe('createStory tool', () => {
  it('should successfully create a story', async () => {
    // Arrange
    const rallyClient = mockRallyClient();
    rallyClient.create.mockResolvedValue({ FormattedID: 'US123' });

    // Act
    const result = await createStoryTool({ name: 'Test Story', projectId: 'proj1' }, rallyClient);

    // Assert
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('US123');
    expect(rallyClient.create).toHaveBeenCalledWith(
      'HierarchicalRequirement',
      expect.objectContaining({ Name: 'Test Story' }),
    );
  });
});
```

### Integration Testing

Integration tests verify that modules work together correctly:

```typescript
// Example integration test
describe('Story resource handlers', () => {
  it('should retrieve and format stories from Rally', async () => {
    // Setup mock Rally API responses
    const mockRally = setupMockRally();
    mockRally.query.mockResolvedValue({
      Results: [{ ObjectID: 1, Name: 'Story 1' }],
    });

    // Test the resource handler with the mock
    const uri = new URL('rally://stories');
    const result = await storyResourceHandler(uri);

    // Verify the result format and content
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe('rally://story/1');
  });
});
```

### End-to-End Testing

E2E tests verify the complete flow from client request to response:

```typescript
// Example E2E test
describe('MCP Server E2E', () => {
  let server: McpServer;
  let client: McpClient;

  beforeAll(async () => {
    // Setup MCP server with mock Rally client
    server = await setupTestServer();
    client = await connectTestClient(server);
  });

  it('should list stories via resource endpoint', async () => {
    // Act
    const result = await client.readResource({
      uri: 'rally://stories',
    });

    // Assert
    expect(result.contents).toBeDefined();
    expect(result.contents).toHaveLength(2); // Based on mock data
  });

  afterAll(async () => {
    await client.disconnect();
    await server.shutdown();
  });
});
```

## Debugging

### Server Debugging

1. **Local debugging**: Use the VS Code debugger by launching the server in debug mode:

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Server",
      "program": "${workspaceFolder}/dist/index.js",
      "preLaunchTask": "npm: build",
      "env": {
        "LOG_LEVEL": "debug"
      }
    }
  ]
}
```

2. **Transport debugging**:

   - For STDIO: Test with the MCP Inspector tool
   - For HTTP: Use browser devtools or Postman

3. **Debug logging**:
   - Set `LOG_LEVEL=debug` for verbose logging
   - Use `utils/logger.ts` with appropriate log levels

### Troubleshooting

Common issues and their solutions:

1. **Connection issues**:

   - Check transport configuration
   - Verify port is not in use (for HTTP)
   - Ensure correct protocol version

2. **Rally API issues**:

   - Validate credentials
   - Check for rate limiting
   - Verify workspace/project access

## Deployment

### Building for Production

1. Build the project:

```bash
npm run build
```

2. Package:

```bash
npm pack
```

### Docker Deployment

A Dockerfile is provided for containerized deployment:

```bash
# Build the Docker image
docker build -t mcp-rally-server .

# Run the container
docker run -p 3000:3000 \
  -e RALLY_API_KEY=your_api_key \
  -e RALLY_WORKSPACE=your_workspace \
  mcp-rally-server
```

### Environment Variables

| Variable          | Description                    | Required | Default |
| ----------------- | ------------------------------ | -------- | ------- |
| `RALLY_API_KEY`   | Rally API key                  | Yes      | -       |
| `RALLY_USERNAME`  | Rally username (if no API key) | No       | -       |
| `RALLY_PASSWORD`  | Rally password (if no API key) | No       | -       |
| `RALLY_WORKSPACE` | Default Rally workspace        | Yes      | -       |
| `RALLY_PROJECT`   | Default Rally project          | No       | -       |
| `PORT`            | HTTP port (for HTTP transport) | No       | `3000`  |
| `LOG_LEVEL`       | Logging level                  | No       | `info`  |

## Contributing

### Getting Started

1. Fork the repository
2. Clone your fork
3. Create a feature branch
4. Make your changes
5. Submit a pull request

### Pull Request Process

1. Ensure all tests pass
2. Update documentation as needed
3. Add tests for new features
4. Get a code review from a maintainer

### Code of Conduct

We follow a standard code of conduct:

- Be respectful and inclusive
- Value constructive feedback
- Focus on the best solution for the project
- Be patient with new contributors

---

This development guide, together with the PRD and Architecture Guide, should provide all the information needed to contribute to the mcp-rally-server project. For any questions or clarifications, please open an issue on GitHub.

## Code Examples

### Server Initialization

The server is created using the MCP SDK directly:

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

### Resource Handler Example

Resources are registered directly with the server:

```typescript
// src/handlers/resources.ts
import { Server, ResourceTemplate } from '@modelcontextprotocol/sdk/server';
import { RallyClient } from '../rally/client';

/**
 * Helper function to handle stories with any query parameters
 */
async function handleStories(uri: any, rallyClient: RallyClient) {
  try {
    // Parse URL parameters if any
    const url = new URL(uri.toString());
    const queryParams: Record<string, string> = {};

    // Extract query parameters
    url.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    const data = await rallyClient.getStories(queryParams);

    if (!data || !data.Results) {
      return {
        contents: [],
        _meta: {
          message: 'No stories found',
        },
      };
    }

    return {
      contents: data.Results.map((story: any) => ({
        uri: `rally://story/${story.ObjectID}`,
        text: JSON.stringify(story, null, 2),
      })),
      _meta: {
        total: data.TotalResultCount || data.Results.length,
        pageSize: data.PageSize || data.Results.length,
        startIndex: data.StartIndex || 1,
        hasMore: data.StartIndex + data.PageSize < data.TotalResultCount,
      },
    };
  } catch (error) {
    return {
      contents: [],
      _meta: {
        error: `Failed to fetch stories: ${(error as Error).message}`,
      },
    };
  }
}

export function registerResources(server: Server, rallyClient: RallyClient) {
  // Register standard resources
  server.resource('stories', 'rally://stories', async (uri) => handleStories(uri, rallyClient));

  // Register resources with query parameters
  server.resource('stories-with-params', 'rally://stories?pageSize=5', async (uri) =>
    handleStories(uri, rallyClient),
  );

  // Register story resource - handles individual stories by ID
  server.resource(
    'story',
    new ResourceTemplate('rally://story/{id}', { list: undefined }),
    async (uri, params) => {
      try {
        const id = params.id.toString();
        const data = await rallyClient.getStory(id);

        return {
          contents: [
            {
              uri: `rally://story/${id}`,
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          contents: [],
          _meta: {
            error: `Failed to fetch story: ${error.message}`,
          },
        };
      }
    },
  );

  // Additional resources...
}
```

### Tool Handler Example

Tools are registered with parameter validation using Zod:

```typescript
// src/handlers/tools.ts
import { Server } from '@modelcontextprotocol/sdk/server';
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

  // Additional tools...
}
```
