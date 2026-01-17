# Build stage for frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy backend source
COPY backend/src ./src

# Copy built frontend (will be served by Express)
COPY --from=frontend-build /app/frontend/dist ./public

# Create data directory for SQLite
RUN mkdir -p /data /data/backups

# Environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_PATH=/data/moneywise.db
ENV BACKUP_DIR=/data/backups

# Expose port
EXPOSE 8080

# Start the server
CMD ["node", "src/index.js"]
