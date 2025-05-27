# Build stage
FROM node:20-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript code
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Create a non-root user for security
RUN addgroup -S rallymcp && adduser -S rallymcp -G rallymcp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Copy only necessary files from build stage
COPY --from=build /app/package*.json ./
COPY --from=build /app/dist/ ./dist/

# Install only production dependencies
RUN npm ci --only=production

# Copy additional configuration files
COPY .env ./

# Set permissions
RUN chown -R rallymcp:rallymcp /app

# Switch to non-root user
USER rallymcp

# Expose port
EXPOSE 3000

# Set healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Run the server
CMD ["node", "dist/index.js", "--http"] 