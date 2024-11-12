# Builder Stage
FROM node:lts AS builder

WORKDIR /app

# Copy all project files to the builder stage
COPY . .

RUN npm i
RUN npx tsc

# Final Stage
FROM node:lts-slim

WORKDIR /app

# Copy necessary files from the builder stage
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/playwright.config.js /app/playwright.config.js
COPY --from=builder /app/tests /app/tests

RUN apt update && apt install -y xauth

# Install Playwright and Chromium dependencies
RUN npx playwright install-deps chromium
RUN npx playwright install chromium

# Install only production dependencies
RUN npm prune --production

# Command to run the application
CMD ["node", "/app/dist/main.js"]
