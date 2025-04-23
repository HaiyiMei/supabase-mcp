FROM node:22 AS builder

WORKDIR /app

# Copy package files
COPY . .

# Install dependencies
RUN npm ci --ignore-scripts

# Build the project
RUN npm run build

# Expose the default port
EXPOSE 3001

# Set the entrypoint
ENTRYPOINT ["node", "packages/mcp-server-supabase/dist/sse.js"] 
