# MCP Rally Server

A Model Context Protocol (MCP) server that provides access to Rally data through a standardized interface for LLMs like Claude.

## Overview

This server implements the MCP specification for Rally, allowing LLMs to access, create, and manage Rally data directly. It supports:

- Reading Rally stories
- Creating and updating stories
- Managing relationships between stories

## Features

- **Rally Integration**: Connect to Rally's REST API to access and manipulate data
- **MCP Protocol Support**: Implements the Model Context Protocol for standardized LLM tool access
- **Resources**: Provides access to Rally stories with filtering and pagination
- **Tools**: Offers tools to create, update, and delete Rally stories and manage relationships
- **Docker Support**: Easy deployment with Docker and Docker Compose

## Prerequisites

- Node.js 18 or higher
- Rally API credentials
- Access to a Rally workspace

## Installation

1. Clone this repository:

   ```
   git clone [repository-url]
   cd mcp-rally-server
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Create a `.env` file with your Rally credentials:

   ```
   RALLY_API_KEY=your_rally_api_key
   RALLY_WORKSPACE=your_rally_workspace
   ```

4. Build the server:
   ```
   npm run build
   ```

## Usage

### Starting the Server

The server can run in two modes:

1. **STDIO Mode** (for Claude Desktop):

   ```
   node dist/index.js
   ```

2. **HTTP Mode** (for manual testing or custom integrations):
   ```
   node dist/index.js --http --port 3000
   ```

### Integrating with Claude Desktop

To use with Claude Desktop:

1. Run the configuration helper:

   ```
   node update-claude-config.js
   ```

   Or manually add to your Claude Desktop config:

   ```json
   {
     "mcpServers": {
       "rally": {
         "command": "node",
         "args": ["/full/path/to/dist/index.js"],
         "env": {
           "RALLY_API_KEY": "your_rally_api_key",
           "RALLY_WORKSPACE": "your_rally_workspace",
           "PORT": "3000",
           "LOG_LEVEL": "debug"
         }
       }
     }
   }
   ```

2. Restart Claude Desktop

3. Rally tools will automatically appear in Claude Desktop

### Available Resources

- `rally://test` - Test resource
- `rally://stories` - List all stories
- `rally://stories?pageSize=N` - List stories with pagination

### Available Tools

- `createStory` - Create a new Rally story
- `updateStory` - Update an existing story
- `deleteStory` - Delete a story
- `createRelationship` - Create a relationship between stories
- `removeRelationship` - Remove a relationship
- `getRelationships` - Get relationships for a story

## Testing

Run the included tests:

```
npm test
```

For specific test categories:

```
npm run test:unit      # Run unit tests
npm run test:e2e       # Run end-to-end tests
```

## Development

### Directory Structure

- `src/` - Source code
  - `handlers/` - Resource and tool handlers
  - `rally/` - Rally API client
  - `types/` - TypeScript types
- `test/` - Test files
  - `e2e/` - End-to-end tests
  - `unit/` - Unit tests
- `dist/` - Compiled JavaScript (after build)

### Environment Variables

- `RALLY_API_KEY` - Your Rally API key
- `RALLY_WORKSPACE` - Your Rally workspace name or ID
- `RALLY_PROJECT` (optional) - Specific Rally project to use
- `PORT` (default: 3000) - Port for HTTP server
- `LOG_LEVEL` (default: info) - Logging level (debug, info, warn, error)

## License

ISC License

## Configuration

The server can be configured using the following environment variables:

| Variable        | Description                              | Default    |
| --------------- | ---------------------------------------- | ---------- |
| RALLY_API_KEY   | Your Rally API key                       | (required) |
| RALLY_WORKSPACE | Your Rally workspace name or ID          | (required) |
| PORT            | Server port                              | 3000       |
| LOG_LEVEL       | Logging level (debug, info, warn, error) | info       |

## API Documentation

See [API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) for detailed API documentation.

## Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Run with coverage report
npm run test:coverage
```

The end-to-end tests use a mock Rally server to test the complete workflow without requiring real Rally credentials. These tests verify:

1. Server startup and client connection
2. Story operations (create, update, delete)
3. Relationship operations (create, get, remove)

## Docker Commands

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down

# Build the image manually
docker build -t mcp-rally-server .

# Run the container manually
docker run -p 3000:3000 --env-file .env mcp-rally-server
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
