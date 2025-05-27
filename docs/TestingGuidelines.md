# mcp-rally-server Testing Guidelines

This document outlines testing standards, approaches, and requirements for the mcp-rally-server project.

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Code Coverage Requirements](#code-coverage-requirements)
3. [Test Types](#test-types)
4. [Test Structure](#test-structure)
5. [Mocking Strategies](#mocking-strategies)
6. [Continuous Integration](#continuous-integration)
7. [Test Data Management](#test-data-management)
8. [Running Tests](#running-tests)
9. [Troubleshooting Tests](#troubleshooting-tests)

## Testing Philosophy

The mcp-rally-server project follows these core testing principles:

1. **Test-driven development (TDD)** is encouraged but not strictly required
2. **Comprehensive coverage** is essential, with a minimum of 80% code coverage
3. **Functional approach** to testing, focusing on inputs and outputs
4. **Realistic scenarios** should be used whenever possible
5. **Speed and reliability** are critical for maintaining developer productivity

## Code Coverage Requirements

We maintain strict code coverage requirements to ensure quality:

- **Overall project**: Minimum 80% coverage
- **Core modules**:
  - `rally/client.ts`: Minimum 90% coverage
  - `resources/*.ts`: Minimum 85% coverage
  - `tools/*.ts`: Minimum 85% coverage
- **Support modules**:
  - `config/*`: Minimum 75% coverage
  - `utils/*`: Minimum 80% coverage

Code coverage is measured using Jest's coverage reporter, and monitored in CI for every pull request.

## Test Types

### Unit Tests

Unit tests verify individual functions and modules in isolation.

**Focus areas**:

- Resource handlers
- Tool handlers
- Rally API client functions
- Utility functions
- Configuration handling

**Example unit test**:

````typescript
// Unit test for the createStory tool handler
import { registerTools } from "../src/handlers/tools";
import { Server } from "@modelcontextprotocol/sdk/server";

describe("createStory tool", () => {
  // Setup common test objects
  let mockRallyClient: any;
  let mockServer: any;
  let toolHandler: Function;

  beforeEach(() => {
    // Create a fresh mock for each test
    mockRallyClient = {
      createStory: jest.fn(),
      getStories: jest.fn(),
      getStory: jest.fn(),
      updateStory: jest.fn(),
      deleteStory: jest.fn(),
    };

    // Mock the server's tool registration to capture the handler
    mockServer = {
      tool: jest.fn((name, schema, handler) => {
        if (name === "createStory") {
          toolHandler = handler;
        }
      }),
    };

    // Register tools to set up the toolHandler
    registerTools(mockServer as unknown as Server, mockRallyClient);
  });

  it("should successfully create a story with minimal parameters", async () => {
    // Arrange
    const params = {
      name: "New Story",
      projectId: "project123",
    };

    mockRallyClient.createStory.mockResolvedValue({
      FormattedID: "US123",
      ObjectID: 12345,
      Name: "New Story",
    });

    // Act
    const result = await toolHandler(params);

    // Assert
    expect(result.isError).toBeFalsy();
    expect(mockRallyClient.createStory).toHaveBeenCalledWith({
      Name: "New Story",
      Project: { _ref: "/project/project123" },
    });
    expect(result.content[0].text).toContain("US123");
  });

  it("should return error when Rally API fails", async () => {
    // Arrange
    const params = {
      name: "New Story",
      projectId: "project123",
    };

    const apiError = new Error("Rally API error");
    mockRallyClient.createStory.mockRejectedValue(apiError);

    // Act
    const result = await toolHandler(params);

    // Assert
    expect(result.isError).toBeTruthy();
    expect(result.content[0].text).toContain("Rally API error");
  });
});

### Integration Tests

Integration tests verify how components work together.

**Focus areas**:

- Server with resource handlers
- Server with tool handlers
- Rally client with external API

**Example integration test**:

```typescript
// Integration test for stories resource with Rally client
import { registerResources } from "../src/handlers/resources";
import { RallyClient } from "../src/rally/client";
import { Server } from "@modelcontextprotocol/sdk/server";
import nock from "nock";

describe("Stories resource integration", () => {
  let mockServer: any;
  let resourceHandler: Function;
  let rallyClient: RallyClient;

  beforeEach(() => {
    // Setup HTTP mocks
    nock("https://rally1.rallydev.com")
      .get("/slm/webservice/v2.0/HierarchicalRequirement")
      .query(true) // Match any query params
      .reply(200, {
        Results: [
          { ObjectID: 1, Name: "Story 1", FormattedID: "US1" },
          { ObjectID: 2, Name: "Story 2", FormattedID: "US2" },
        ],
      });

    // Create Rally client with test credentials
    rallyClient = new RallyClient({
      rallyApiKey: "test-key",
      rallyWorkspace: "test-workspace",
      port: 3000,
      logLevel: "info",
    });

    // Mock server to capture resource handler
    mockServer = {
      resource: jest.fn((name, pattern, handler) => {
        if (name === "stories") {
          resourceHandler = handler;
        }
      }),
    };

    // Register resources to set up the handler
    registerResources(mockServer as unknown as Server, rallyClient);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("should retrieve stories and format as resource contents", async () => {
    // Act
    const result = await resourceHandler("rally://stories");

    // Assert
    expect(result.contents).toHaveLength(2);
    expect(result.contents[0].uri).toBe("rally://story/1");
    expect(result.contents[1].uri).toBe("rally://story/2");
    expect(JSON.parse(result.contents[0].text)).toHaveProperty(
      "Name",
      "Story 1"
    );
  });
});

#### Testing Query Parameters

For testing resource handlers with query parameters, use the following approach:

```typescript
describe("Query parameter handling", () => {
  beforeEach(() => {
    // Setup HTTP mocks with query parameter verification
    nock("https://rally1.rallydev.com")
      .get("/slm/webservice/v2.0/HierarchicalRequirement")
      .query((params) => {
        return params.pageSize === "5" && params.start === "1";
      })
      .reply(200, {
        Results: [
          { ObjectID: 1, Name: "Story 1", FormattedID: "US1" },
        ],
        TotalResultCount: 10,
        StartIndex: 1,
        PageSize: 5
      });

    // Additional setup as above
  });

  it("should pass query parameters to Rally API", async () => {
    // Act - use a URI with query parameters
    const result = await resourceHandler("rally://stories?pageSize=5&start=1");

    // Assert
    expect(result.contents).toHaveLength(1);
    expect(result._meta).toBeDefined();
    expect(result._meta.pageSize).toBe(5);
    expect(result._meta.total).toBe(10);
    expect(result._meta.hasMore).toBe(true);
  });

  it("should handle specific query parameter patterns", async () => {
    // Get the handler for the specific pattern
    const specificHandler = mockServer.resource.mock.calls.find(
      call => call[0] === 'stories-with-params'
    )[2];

    // Act
    const result = await specificHandler("rally://stories?pageSize=5");

    // Assert
    expect(result.contents).toBeDefined();
    expect(result._meta.pageSize).toBe(5);
  });
});

### End-to-End Tests

E2E tests verify the entire system from client request to response.

**Focus areas**:

- Full MCP client → server → Rally API flow
- Transport mechanisms (STDIO & HTTP)
- Error handling
- Complete workflows

**Example E2E test**:

```typescript
// E2E test using MCP client SDK
import { createClient } from "@modelcontextprotocol/sdk/client";
import { createServer } from "@modelcontextprotocol/sdk/server";
import { RallyClient } from "../src/rally/client";
import { registerResources } from "../src/handlers/resources";
import { registerTools } from "../src/handlers/tools";
import nock from "nock";

describe("MCP Server E2E", () => {
  let server: any;
  let client: any;
  let port: number;

  beforeAll(async () => {
    // Setup mocks for Rally API
    nock("https://rally1.rallydev.com")
      .persist()
      .get("/slm/webservice/v2.0/HierarchicalRequirement")
      .query(true)
      .reply(200, {
        Results: [{ ObjectID: 1, Name: "E2E Test Story", FormattedID: "US1" }],
      });

    nock("https://rally1.rallydev.com")
      .post("/slm/webservice/v2.0/HierarchicalRequirement")
      .reply(200, {
        CreateResult: {
          Object: { ObjectID: 2, FormattedID: "US2", Name: "New Story" },
        },
      });

    // Use a random port to avoid conflicts in tests
    port = 3000 + Math.floor(Math.random() * 1000);

    // Create a Rally client
    const rallyClient = new RallyClient({
      rallyApiKey: "test-key",
      rallyWorkspace: "test-workspace",
      port,
      logLevel: "info",
    });

    // Create and start server
    server = createServer({
      name: "mcp-rally-server-test",
      version: "1.0.0",
    });

    registerResources(server, rallyClient);
    registerTools(server, rallyClient);

    await server.listen({ type: "http", port, path: "/mcp" });

    // Create and connect client
    client = createClient();
    await client.connect({
      type: "http",
      url: `http://localhost:${port}/mcp`,
    });
  });

  afterAll(async () => {
    if (client) await client.disconnect();
    if (server) await server.shutdown();
    nock.cleanAll();
  });

  it("should list stories via resource endpoint", async () => {
    // Act
    const result = await client.readResource({
      uri: "rally://stories",
    });

    // Assert
    expect(result.contents).toBeDefined();
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe("rally://story/1");
  });

  it("should create a story via tool endpoint", async () => {
    // Act
    const result = await client.executeTool({
      name: "createStory",
      arguments: {
        name: "New Story",
        description: "Created via E2E test",
      },
    });

    // Assert
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("US2");
  });
});
````

## Test Structure

Follow these patterns for structuring tests:

### Directory Structure

```
test/
├── unit/                   # Unit tests
│   ├── handlers/           # Handler tests
│   │   ├── resources.test.ts
│   │   └── tools.test.ts
│   ├── rally/              # Rally client tests
│   │   └── client.test.ts
│   └── config.test.ts      # Configuration tests
├── integration/            # Integration tests
│   ├── handlers.integration.test.ts
│   └── rally-client.integration.test.ts
└── e2e/                    # End-to-end tests
    ├── server.e2e.test.ts
    └── workflows.e2e.test.ts
```

### File Naming

- Unit tests: `[module-name].test.ts`
- Integration tests: `[module-combination].integration.test.ts`
- E2E tests: `[scenario-name].e2e.test.ts`

### Test Case Organization

Organize tests with descriptive nesting:

```typescript
describe('Module: createStory tool', () => {
  describe('when given valid parameters', () => {
    it('should create a story successfully', () => {
      /* ... */
    });
    it('should include all optional parameters when provided', () => {
      /* ... */
    });
  });

  describe('when parameters are invalid', () => {
    it('should reject missing required parameters', () => {
      /* ... */
    });
    it('should validate parameter types', () => {
      /* ... */
    });
  });

  describe('when Rally API fails', () => {
    it('should return error format for API errors', () => {
      /* ... */
    });
    it('should include helpful error message', () => {
      /* ... */
    });
  });
});
```

## Mocking Strategies

### Rally API Mocking

We use several approaches to mock the Rally API:

#### 1. Direct Function Mocking

For unit tests, mock the Rally client functions directly:

```typescript
const mockRallyClient = {
  getStories: jest.fn().mockResolvedValue({
    Results: [{ ObjectID: 1, Name: 'Story 1' }],
  }),
  createStory: jest.fn().mockResolvedValue({
    FormattedID: 'US123',
  }),
};
```

#### 2. HTTP Request Mocking

For integration tests, mock the HTTP layer using nock:

```typescript
nock('https://rally1.rallydev.com')
  .get('/slm/webservice/v2.0/HierarchicalRequirement')
  .query((params) => {
    // Validate query parameters
    return params.workspace === '/workspace/test-workspace';
  })
  .reply(200, {
    Results: [{ ObjectID: 1, Name: 'Story 1', FormattedID: 'US1' }],
  });
```

### MCP Server Mocking

For testing handlers independently:

```typescript
// Create a mock server
const mockServer = {
  resource: jest.fn(),
  tool: jest.fn(),
};

// Register handlers with the mock server
registerResources(mockServer as unknown as Server, rallyClient);
registerTools(mockServer as unknown as Server, rallyClient);

// Verify the registrations
expect(mockServer.resource).toHaveBeenCalledWith(
  'stories',
  'rally://stories',
  expect.any(Function),
);
```

## Continuous Integration

We use GitHub Actions for continuous integration (CI).

### CI Workflow

The workflow includes:

1. **Build Check**: Build the project to ensure compilation succeeds
2. **Linting**: Run ESLint to ensure code style
3. **Unit Tests**: Run unit tests
4. **Integration Tests**: Run integration tests
5. **E2E Tests**: Run end-to-end tests
6. **Coverage Report**: Generate and publish coverage report
7. **Coverage Check**: Fail if coverage is below the required threshold

### Coverage Threshold Enforcement

Jest is configured with strict coverage thresholds:

```javascript
// jest.config.js
module.exports = {
  // ...
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/rally/**/*.ts': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/resources/**/*.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './src/tools/**/*.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
};
```

## Test Data Management

### Fixture Generation

We use a combination of:

1. **Hand-crafted fixtures** for special cases
2. **Recorded real responses** for common scenarios
3. **Programmatically generated fixtures** for variations

### Recording Real Responses

Use the recording script to capture real Rally API responses:

```bash
# Record Rally API response for GET stories
npm run record-fixture -- --endpoint=HierarchicalRequirement --query='(Project.Name="Test Project")'
```

This generates a fixture file that can be used in tests:

```typescript
// Import recorded fixture
import storiesFixture from '../../fixtures/rally-responses/HierarchicalRequirement-query.json';

// Use in tests
mockRallyClient.query.mockResolvedValue(storiesFixture);
```

## Running Tests

### Running All Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

### Running Specific Tests

```bash
# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only E2E tests
npm run test:e2e

# Run specific test file
npm test -- tools/createStory.test.ts

# Run tests matching description
npm test -- -t "should create a story successfully"
```

### Watch Mode

For active development, use watch mode:

```bash
npm test -- --watch
```

## Troubleshooting Tests

### Common Issues

1. **Timeouts**: For tests that interact with mock servers, increase the timeout:

   ```typescript
   jest.setTimeout(10000); // Increase timeout to 10s
   ```

2. **Nock Issues**: If nock is not intercepting requests:

   ```typescript
   // At the beginning of the test file
   nock.disableNetConnect(); // Prevent real network connections

   // In afterAll
   nock.enableNetConnect();
   ```

3. **Flaky Tests**: Look for:
   - Time dependencies (use fake timers)
   - Order dependencies (ensure proper test isolation)
   - Race conditions (use proper async/await and avoid setTimeout)

### Debugging Tests

1. **Debug Logging**:

   ```typescript
   // Enable debug logging in tests
   process.env.LOG_LEVEL = 'debug';
   ```

2. **Jest Debugging**:

   ```bash
   # Run a specific test with Node inspector
   node --inspect-brk node_modules/.bin/jest --runInBand tools/createStory.test.ts
   ```

3. **VS Code Debug Configuration**:

   ```json
   {
     "type": "node",
     "request": "launch",
     "name": "Debug Current Test",
     "program": "${workspaceFolder}/node_modules/.bin/jest",
     "args": ["${fileBasename}", "--runInBand", "--no-cache"],
     "console": "integratedTerminal",
     "internalConsoleOptions": "neverOpen"
   }
   ```

---

Following these testing guidelines will ensure the mcp-rally-server is robust, reliable, and maintainable. The required 80%+ code coverage helps catch bugs early and provides confidence when making changes.
