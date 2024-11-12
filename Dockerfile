# Builder Stage
FROM node:20 AS builder

WORKDIR /app

# Copy all project files to the builder stage
COPY . .

RUN npm i
RUN npx tsc

# Final Stage
FROM node:20-slim

WORKDIR /app

# Copy necessary files from the builder stage
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json

RUN apt update && apt install -y xauth

# Install Playwright and Chromium dependencies
RUN npx playwright install-deps chromium
RUN npx playwright install chromium

# Install only production dependencies
RUN npm prune --production

# Command to run the application
CMD ["node", "/app/dist/main.js"]
