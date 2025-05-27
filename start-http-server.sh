#!/bin/bash

# Start MCP Rally Server in HTTP mode
echo "Starting MCP Rally Server in HTTP mode..."

# Ensure we're in the right directory
cd "$(dirname "$0")"

# Kill any existing server on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
echo "Port 3000 cleared for use"

# Start server in HTTP mode
node dist/index.js --http --hostname 127.0.0.1 --port 3000

# This script should be made executable with: chmod +x start-http-server.sh 