# Builder Stage
FROM node:lts AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install dependencies (this layer will be cached unless package files change)
RUN npm i

# Copy source files and configuration
COPY src/ ./src/
COPY tsconfig.json ./
COPY tests/ ./tests/
COPY playwright.config.js ./

# Build the application
RUN npx tsc

# Final Stage  
FROM node:lts-slim

WORKDIR /app

# Copy package.json first for Playwright caching
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/node_modules /app/node_modules

# Install system dependencies for Playwright and Xvfb (this will be cached unless base image changes)
RUN apt update && apt install -y \
    xauth \
    xvfb \
    x11-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright and Chromium dependencies (this will be cached unless package.json changes)
RUN npx playwright install-deps chromium
RUN npx playwright install chromium

# Install only production dependencies (cached with other dependency operations)
RUN npm prune --production

# Set environment variables for headless operation
ENV DISPLAY=:99
ENV HEADLESS=true

# Copy the rest of the files after all dependency/system setup is complete
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/playwright.config.js /app/playwright.config.js
COPY --from=builder /app/tests /app/tests

# Command to run the application
CMD ["node", "/app/dist/main.js"]
