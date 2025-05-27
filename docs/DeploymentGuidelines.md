# mcp-rally-server Deployment Guidelines

This document provides comprehensive instructions for deploying the mcp-rally-server in various environments. The server can be deployed locally, on a remote server, or as a Docker container.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Configuration](#configuration)
3. [Local Deployment](#local-deployment)
4. [Remote Server Deployment](#remote-server-deployment)
5. [Docker Deployment](#docker-deployment)
6. [Client Connection](#client-connection)
7. [Security Considerations](#security-considerations)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying the mcp-rally-server, ensure you have:

- A Rally account with API access
- API key or username/password for Rally authentication
- Git (for obtaining the source code)

## Configuration

The mcp-rally-server can be configured through environment variables or a configuration file.

### Environment Variables

```
RALLY_API_KEY=your_api_key
RALLY_WORKSPACE=your_workspace
RALLY_PROJECT=your_project        # Optional default project
PORT=3000                         # Port for HTTP transport (default: 3000)
LOG_LEVEL=info                    # Logging level (debug, info, warn, error)
```

### Configuration File

Alternatively, create a `.env` file in the project root with the same variables.

```
RALLY_API_KEY=your_api_key
RALLY_WORKSPACE=your_workspace
RALLY_PROJECT=your_project
PORT=3000
LOG_LEVEL=info
```

## Local Deployment

This section covers running the server directly on your local machine.

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-org/mcp-rally-server.git
cd mcp-rally-server
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure the Server

Create a `.env` file in the project root:

```bash
echo "RALLY_API_KEY=your_api_key" > .env
echo "RALLY_WORKSPACE=your_workspace" >> .env
echo "RALLY_PROJECT=your_project" >> .env
```

### Step 4: Build the Server

```bash
npm run build
```

### Step 5: Run the Server

#### Option A: As a STDIO Server

Run the server with stdin/stdout for direct use with applications that support STDIO transport:

```bash
node dist/index.js
```

#### Option B: As an HTTP Server

Run the server with HTTP transport for network-based access:

```bash
node dist/index.js --http
```

### Step 6: Verify the Deployment

To check if the server is running correctly:

```bash
# For HTTP server
curl http://localhost:3000/mcp -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"name":"test-client","version":"1.0.0"}}'

# Expected output should contain server capabilities
```

## Remote Server Deployment

This section covers deploying to a remote server like AWS, GCP, or a VPS.

### Step 1: Prepare the Server

SSH into your remote server and install the required dependencies:

```bash
# Update package lists
sudo apt update

# Install Node.js and npm (example for Ubuntu/Debian)
sudo apt install -y nodejs npm git

# Verify installation
node --version
npm --version
```

### Step 2: Clone the Repository

```bash
git clone https://github.com/your-org/mcp-rally-server.git
cd mcp-rally-server
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Configure the Server

Create a configuration file with your Rally credentials:

```bash
cat > .env << EOL
RALLY_API_KEY=your_api_key
RALLY_WORKSPACE=your_workspace
RALLY_PROJECT=your_project
PORT=3000
LOG_LEVEL=info
EOL
```

### Step 5: Build the Server

```bash
npm run build
```

### Step 6: Run the Server

#### Option A: Using Screen (simple background process)

```bash
# Install screen if not available
sudo apt install -y screen

# Start a new screen session
screen -S mcp-rally

# Run the server
node dist/index.js --http --port 3000

# Detach from screen by pressing Ctrl+A then D
```

#### Option B: Using Systemd (recommended for production)

Create a systemd service file:

```bash
sudo cat > /etc/systemd/system/mcp-rally.service << EOL
[Unit]
Description=MCP Rally Server
After=network.target

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/mcp-rally-server
ExecStart=/usr/bin/node /path/to/mcp-rally-server/dist/index.js --http --port 3000
Restart=on-failure
Environment=NODE_ENV=production
EnvironmentFile=/path/to/mcp-rally-server/.env

[Install]
WantedBy=multi-user.target
EOL
```

Start and enable the service:

```bash
sudo systemctl daemon-reload
sudo systemctl start mcp-rally
sudo systemctl enable mcp-rally
```

#### Option C: Using PM2 (process manager)

```bash
# Install PM2 globally
npm install -g pm2

# Start the server with PM2
pm2 start dist/index.js --name "mcp-rally-server" -- --http

# Ensure PM2 starts on system boot
pm2 startup
pm2 save
```

### Step 7: Configure Firewall (if needed)

```bash
# For UFW (Uncomplicated Firewall)
sudo ufw allow 3000/tcp
sudo ufw status

# For iptables
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
```

### Step 8: Set Up a Reverse Proxy (Optional)

For production deployments, consider using Nginx as a reverse proxy:

```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx configuration
sudo cat > /etc/nginx/sites-available/mcp-rally << EOL
server {
    listen 80;
    server_name your-domain.com;

    location /mcp {
        proxy_pass http://localhost:3000/mcp;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOL

# Enable the configuration
sudo ln -s /etc/nginx/sites-available/mcp-rally /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Docker Deployment

This section covers deploying the server using Docker, which is ideal for containerized environments.

### Step 1: Create a Dockerfile

If not already present, create a `Dockerfile` in the project root:

```Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Expose the HTTP port
EXPOSE 3000

# Start the server
CMD ["node", "dist/index.js", "--http"]
```

### Step 2: Create a .dockerignore file

Create a `.dockerignore` file to exclude unnecessary files:

```
node_modules
npm-debug.log
dist
.git
.env
```

### Step 3: Build the Docker Image

```bash
docker build -t mcp-rally-server .
```

### Step 4: Run the Docker Container

```bash
docker run -d \
  --name mcp-rally \
  -p 3000:3000 \
  -e RALLY_API_KEY=your_api_key \
  -e RALLY_WORKSPACE=your_workspace \
  -e RALLY_PROJECT=your_project \
  -e LOG_LEVEL=info \
  mcp-rally-server
```

### Step 5: Check Container Status

```bash
docker ps
docker logs mcp-rally
```

### Step 6: Docker Compose (Optional)

For easier management, create a `docker-compose.yml` file:

```yaml
version: "3"
services:
  mcp-rally:
    build: .
    ports:
      - "3000:3000"
    environment:
      - RALLY_API_KEY=your_api_key
      - RALLY_WORKSPACE=your_workspace
      - RALLY_PROJECT=your_project
      - LOG_LEVEL=info
    restart: unless-stopped
```

Run with Docker Compose:

```bash
docker-compose up -d
```

## Client Connection

Different MCP clients can connect to your deployed server. Here are connection instructions for common clients:

### 1. Claude Desktop

1. Open Claude Desktop
2. Go to Settings > MCP Servers
3. Click "Add Server"
4. Enter the following details:
   - Name: Rally Server
   - Transport: HTTP
   - URL: `http://your-server-address:3000/mcp`
5. Click "Save" and select the server to connect

### 2. VS Code (with GitHub Copilot)

1. Open VS Code settings
2. Search for "Copilot MCP"
3. Add a new server configuration:
   - Name: Rally Server
   - URL: `http://your-server-address:3000/mcp`

### 3. Cursor Editor

1. Open Cursor settings
2. Navigate to "MCP Servers"
3. Add a new server with:
   - Name: Rally Server
   - URL: `http://your-server-address:3000/mcp`

### 4. Command Line with MCP Inspector

1. Install the MCP Inspector:
   ```bash
   npm install -g @modelcontextprotocol/inspector
   ```
2. Connect to your server:
   ```bash
   mcp-inspector connect http://your-server-address:3000/mcp
   ```

### 5. For STDIO-based Clients

When using the server with STDIO transport, you need to spawn the server process directly:

```bash
# Node.js example
const { spawn } = require('child_process');
const server = spawn('node', ['/path/to/dist/index.js']);

// Communicate via stdin/stdout
server.stdout.on('data', handleServerOutput);
server.stdin.write(JSON.stringify(mcpRequest));
```

## Security Considerations

### API Key Protection

1. Never commit API keys to version control
2. Use environment variables or secure secret management
3. Consider using a read-only API key when possible

### Network Security

1. For public servers, use HTTPS (TLS/SSL) with a reverse proxy like Nginx
2. Restrict access using IP allowlisting when possible
3. Consider implementing authentication for the HTTP endpoint

### Container Security

1. Use the latest base images and keep them updated
2. Run the container as a non-root user
3. Scan container images for vulnerabilities

## Troubleshooting

### Common Issues

1. **Connection Refused**

   - Check if the server is running
   - Verify the correct port is exposed
   - Check firewall settings

2. **Authentication Errors**

   - Verify Rally API key is correct
   - Check if the API key has necessary permissions
   - Verify workspace and project names

3. **Server Crashes**
   - Check logs with `docker logs mcp-rally` or systemd logs
   - Ensure Rally services are available
   - Check memory/resource limits

### Viewing Logs

```bash
# For systemd service
sudo journalctl -u mcp-rally

# For Docker container
docker logs mcp-rally

# For PM2
pm2 logs mcp-rally
```

### Health Check

Create a simple health check script to verify server operation:

```bash
#!/bin/bash
response=$(curl -s -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"name":"health-check","version":"1.0.0"}}' http://localhost:3000/mcp)

if echo "$response" | grep -q "capabilities"; then
  echo "Server is healthy"
  exit 0
else
  echo "Server health check failed"
  exit 1
fi
```

---

These deployment guidelines should help you get the mcp-rally-server running in various environments. For specific client integration questions or advanced deployment scenarios, please refer to the project's issue tracker or contact the maintainers.
