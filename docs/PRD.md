**Product Requirements Document (PRD) for mcp_rally_server**

**1. Overview**

- **Product Name**: mcp_rally_server
- **Purpose**: Provide a Model Context Protocol (MCP) server that wraps Broadcom Rally WSAPI, exposing Rally data and operations through MCP.
- **Audience**: Developers building integrations and LLM agents that need to interact with Rally data.

**2. Goals**

- Create a simple, reliable MCP server that provides read/write access to Rally artifacts
- Support standard MCP resources and tools for accessing Rally data
- Enable basic LLM workflows for common Rally operations
- Provide a straightforward API that maps Rally concepts to MCP primitives
- Implement MCP specification correctly to ensure broad client compatibility

**3. Scope**

- **In Scope**:

  - Basic MCP server with minimal configuration
  - Resources for reading Rally artifacts (stories, tasks, defects)
  - Tools for creating and updating Rally artifacts
  - Support for both STDIO and HTTP transports
  - Simple authentication via API key
  - Basic error handling and validation
  - Tool handlers for create, update, delete, rank, link operations
  - Context switching via workspace/project parameters
  - Zod-based parameter schemas, logging, configuration management, and tests

- **Out of Scope**:
  - Complex workflow automation
  - Custom UI components
  - Advanced authentication flows
  - Performance optimization for large datasets
  - Client-specific UI integration code

**4. Core Features**

1. **Rally Resources**

   - List available stories, tasks, defects
   - Read individual artifact details
   - Query artifacts by common filters

2. **Rally Tools**

   - Create new artifacts
   - Update existing artifacts
   - Link artifacts together

3. **Transport Support**
   - Command-line usage via STDIO
   - Network usage via HTTP

**5. Implementation Requirements**

- Use the TypeScript MCP SDK
- Create a simple Rally API client using Axios
- Implement basic parameter validation
- Handle common error scenarios
- Provide simple setup instructions
- Adhere to MCP protocol specification

**6. Architecture**

```
[MCP Clients] <-> [Transport Layer] <-> [MCP Server] <-> [Rally Client] <-> [Rally WSAPI]
```

Basic components:

- Transport handlers (stdio, http)
- MCP resources and tools
- Rally API client
- Configuration loader

**7. Implementation Plan**

| Phase         | Description                                   | Duration |
| ------------- | --------------------------------------------- | -------- |
| Setup         | Project structure, dependencies, basic server | 1 week   |
| Resources     | Implement basic Rally resource endpoints      | 2 weeks  |
| Tools         | Implement basic Rally modification tools      | 2 weeks  |
| Testing       | End-to-end testing and bug fixes              | 1 week   |
| Documentation | Basic usage guide and examples                | 1 week   |

**8. Code Examples**

**Resource Example:**

```ts
// Simple resource for listing stories
server.resource("stories", "rally://stories", async (uri) => {
  const stories = await rallyClient.query("HierarchicalRequirement");
  return {
    contents: stories.Results.map((story) => ({
      uri: `rally://story/${story.ObjectID}`,
      text: JSON.stringify(story),
    })),
  };
});
```

**Tool Example:**

```ts
// Simple tool for creating a story
server.tool(
  "createStory",
  {
    name: z.string(),
    description: z.string().optional(),
    projectId: z.string(),
  },
  async ({ name, description, projectId }) => {
    try {
      const result = await rallyClient.create("HierarchicalRequirement", {
        Name: name,
        Description: description,
        Project: { _ref: `/project/${projectId}` },
      });

      return {
        content: [
          { type: "text", text: `Created story: ${result.FormattedID}` },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);
```

**Context Switching Example:**

```ts
// Tool for setting the current workspace/project context
server.tool(
  "setContext",
  {
    workspace: z.string().optional(),
    project: z.string().optional(),
  },
  async ({ workspace, project }) => {
    // Update the client's context for future operations
    if (workspace) {
      rallyClient.setWorkspace(workspace);
    }
    if (project) {
      rallyClient.setProject(project);
    }

    return {
      content: [
        {
          type: "text",
          text: `Context updated to ${
            workspace ? "workspace: " + workspace : ""
          } ${project ? "project: " + project : ""}`,
        },
      ],
    };
  }
);
```

**9. Setup Instructions**

```bash
# Install
npm install mcp-rally-server

# Configure
export RALLY_API_KEY=your_api_key
export RALLY_WORKSPACE=your_workspace

# Run with stdio
npx mcp-rally-server

# Run with HTTP server
npx mcp-rally-server --http --port 3000
```

**10. Dependencies**

- TypeScript
- MCP SDK (`@modelcontextprotocol/sdk`)
- Axios
- Node.js (v16+)
- Zod (for schema validation)

---

_End of PRD for mcp_rally_server_
