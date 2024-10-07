FROM node:20

WORKDIR /app

COPY . .
RUN apt update && apt install -y vim xauth
RUN npm install
RUN npx playwright install-deps
RUN npx playwright install
RUN npx tsc
CMD ["node", "/app/dist/main.js"]
