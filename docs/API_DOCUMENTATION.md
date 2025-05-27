# MCP Rally Server API Documentation

This document describes the API for the MCP Rally Server, which allows LLMs to access and manipulate Rally data through a standardized Model Context Protocol (MCP) interface.

## Overview

The MCP Rally Server provides resources and tools for working with Rally stories and their relationships. It supports:

1. **Resources**: Read-only access to Rally data (stories, individual stories)
2. **Tools**: Perform actions on Rally data (create, update, delete stories and manage relationships)

## Configuration

The server requires the following environment variables:

- `RALLY_API_KEY`: Your Rally API key
- `RALLY_WORKSPACE`: Your Rally workspace name or ID
- `PORT` (optional): Server port (defaults to 3000)
- `LOG_LEVEL` (optional): Logging level (defaults to 'info')

## Resources

### Stories Resource

Retrieves a list of stories from Rally, with optional filtering and pagination.

- **URI**: `rally://stories`
- **Query Parameters**:
  - `query` (optional): Rally query string (e.g., `(Name contains "Feature")`)
  - `pageSize` (optional): Number of results per page (default: 20)
  - `start` (optional): Starting index for pagination (1-based)
- **Returns**: Array of Rally story objects in JSON format

#### Example

```javascript
const response = await client.readResource({
  uri: 'rally://stories?pageSize=5&query=(ScheduleState=Defined)',
});

// Response includes stories and metadata for pagination
```

### Story Resource

Retrieves a single story by its ID.

- **URI**: `rally://story/{id}`
- **Parameters**:
  - `id`: Rally story object ID
- **Returns**: A Rally story object in JSON format

#### Example

```javascript
const response = await client.readResource({
  uri: 'rally://story/12345',
});

// Response includes the story details
```

## Tools

### Create Story Tool

Creates a new story in Rally.

- **Name**: `createStory`
- **Arguments**:
  - `name` (required): Name of the story
  - `description` (optional): Description of the story
  - `state` (optional): Schedule state (e.g., "Defined", "In-Progress")
  - `estimate` (optional): Plan estimate points
  - `priority` (optional): Priority (e.g., "High", "Medium", "Low")
  - `project` (optional): Project FormattedID or Name
  - `tags` (optional): Array of tag names
- **Returns**: The created story object

#### Example

```javascript
const result = await client.executeTool({
  name: 'createStory',
  arguments: {
    name: 'New Feature Implementation',
    description: 'Implement the new feature as discussed',
    state: 'Defined',
    estimate: 5,
    priority: 'High',
  },
});

// Result contains the created story details
```

### Update Story Tool

Updates an existing story in Rally.

- **Name**: `updateStory`
- **Arguments**:
  - `id` (required): FormattedID of the story to update (e.g., "US123")
  - `name` (optional): New name for the story
  - `description` (optional): New description
  - `state` (optional): New schedule state
  - `estimate` (optional): New plan estimate points
  - `priority` (optional): New priority
  - `project` (optional): New project FormattedID or Name
  - `tags` (optional): New array of tag names
- **Returns**: The updated story object

#### Example

```javascript
const result = await client.executeTool({
  name: 'updateStory',
  arguments: {
    id: 'US123',
    name: 'Updated Feature Implementation',
    state: 'In-Progress',
    estimate: 8,
  },
});

// Result contains the updated story details
```

### Delete Story Tool

Deletes a story from Rally.

- **Name**: `deleteStory`
- **Arguments**:
  - `id` (required): FormattedID of the story to delete (e.g., "US123")
- **Returns**: Success message

#### Example

```javascript
const result = await client.executeTool({
  name: 'deleteStory',
  arguments: {
    id: 'US123',
  },
});

// Result contains success message
```

### Create Relationship Tool

Creates a relationship between two Rally artifacts.

- **Name**: `createRelationship`
- **Arguments**:
  - `sourceId` (required): FormattedID of the source artifact (e.g., "US123")
  - `targetId` (required): FormattedID of the target artifact (e.g., "US456")
  - `relationshipType` (required): Type of relationship. One of:
    - "Predecessor"
    - "Successor"
    - "Parent"
    - "Child"
- **Returns**: Success message

#### Example

```javascript
const result = await client.executeTool({
  name: 'createRelationship',
  arguments: {
    sourceId: 'US123',
    targetId: 'US456',
    relationshipType: 'Predecessor',
  },
});

// Result confirms relationship creation
```

### Remove Relationship Tool

Removes a relationship between two Rally artifacts.

- **Name**: `removeRelationship`
- **Arguments**:
  - `sourceId` (required): FormattedID of the source artifact (e.g., "US123")
  - `targetId` (required): FormattedID of the target artifact (e.g., "US456")
  - `relationshipType` (required): Type of relationship to remove
- **Returns**: Success message

#### Example

```javascript
const result = await client.executeTool({
  name: 'removeRelationship',
  arguments: {
    sourceId: 'US123',
    targetId: 'US456',
    relationshipType: 'Predecessor',
  },
});

// Result confirms relationship removal
```

### Get Relationships Tool

Retrieves all relationships for a Rally artifact.

- **Name**: `getRelationships`
- **Arguments**:
  - `artifactId` (required): FormattedID of the artifact (e.g., "US123")
- **Returns**: Object containing all relationships for the artifact

#### Example

```javascript
const result = await client.executeTool({
  name: 'getRelationships',
  arguments: {
    artifactId: 'US123',
  },
});

// Result contains all relationships for US123
```

## Error Handling

All tools and resources return appropriate error messages when operations fail. Error responses include:

- HTTP error status codes
- Error description
- Validation errors for invalid inputs

## Pagination

The stories resource supports pagination with the following metadata in the response:

- `_meta.next`: URI for the next page of results
- `_meta.prev`: URI for the previous page of results
- `_meta.total`: Total number of results available

Use the provided URIs to navigate through paginated results.

## Examples

### Basic Workflow Example

```javascript
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

async function workWithRally() {
  // Connect to the MCP Rally server
  const client = new Client();
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'));
  await client.connect(transport);

  try {
    // Get list of stories
    const storiesResponse = await client.readResource({
      uri: 'rally://stories?pageSize=5',
    });
    console.log(`Found ${storiesResponse.contents.length} stories`);

    // Create a new story
    const newStory = await client.executeTool({
      name: 'createStory',
      arguments: {
        name: 'Implement New Feature',
        description: 'This is a new feature to be implemented',
        state: 'Defined',
        estimate: 5,
      },
    });
    const storyData = JSON.parse(newStory.content[0].text);
    console.log(`Created story with ID: ${storyData.FormattedID}`);

    // Update the story
    await client.executeTool({
      name: 'updateStory',
      arguments: {
        id: storyData.FormattedID,
        state: 'In-Progress',
      },
    });
    console.log(`Updated story state to In-Progress`);

    // Create a relationship
    await client.executeTool({
      name: 'createRelationship',
      arguments: {
        sourceId: storyData.FormattedID,
        targetId: 'US123', // An existing story
        relationshipType: 'Predecessor',
      },
    });
    console.log(`Created relationship: ${storyData.FormattedID} is a predecessor of US123`);

    // Get all relationships
    const relationships = await client.executeTool({
      name: 'getRelationships',
      arguments: {
        artifactId: storyData.FormattedID,
      },
    });
    console.log('Relationships:', JSON.parse(relationships.content[0].text));
  } finally {
    // Disconnect client
    transport.close();
  }
}

workWithRally().catch(console.error);
```

## Authentication

The server uses the provided Rally API key for authentication. All client requests are authenticated with the server using the Rally API key specified in the environment variables.

## Rate Limiting

The server respects Rally's rate limits. If rate limits are exceeded, appropriate error messages will be returned.
