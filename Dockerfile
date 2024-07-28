FROM node:20

WORKDIR /app

COPY . .
RUN npm install
RUN npx playwright install-deps
RUN npx playwright install
RUN npx tsc
CMD ["node", "/app/dist/main.js"]
