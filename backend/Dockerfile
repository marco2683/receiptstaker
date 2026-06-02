FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Create data directories
RUN mkdir -p /app/data/receipts /app/data/uploads

# Build
RUN npx tsc

# Expose port
EXPOSE 3001

# Set default env vars
ENV PORT=3001
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data
ENV SPREADSHEET_FILE=receipts.xlsx
ENV RECEIPTS_FOLDER=receipts

# Start server
CMD ["node", "dist/server.js"]
