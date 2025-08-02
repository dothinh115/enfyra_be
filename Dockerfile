# Multi-stage build for optimized Docker image
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install ALL dependencies (including devDependencies for build)
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build application
RUN yarn build

# Production stage
FROM node:20-alpine AS production

# Install only runtime dependencies
RUN apk add --no-cache sqlite

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S enfyra -u 1001

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install only production dependencies
RUN yarn install --frozen-lockfile --production && \
    yarn cache clean

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts

# Copy necessary runtime files
COPY src/data-source/data-source.ts ./src/data-source/data-source.ts

# Change ownership to non-root user
RUN chown -R enfyra:nodejs /app
USER enfyra

# Expose port
EXPOSE 1105

# No health check - Let Kubernetes handle readiness/liveness probes

# Start command
CMD ["node", "dist/src/main.js"]
