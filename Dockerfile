FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm i -D tsx typescript @types/pg @types/node
COPY . .
EXPOSE 8080
CMD ["npx", "tsx", "src/server.ts"]
