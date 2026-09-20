FROM node:20-slim

# Install system dependencies for canvas / puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy dependency specifications
COPY package.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/

# Install all dependencies
RUN npm run postinstall

# Copy remaining source files
COPY . .

# Build frontend and backend
RUN npm run build

EXPOSE 3001

ENV NODE_ENV=production
ENV DATA_DIR=/app/data

CMD ["npm", "start"]
