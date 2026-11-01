FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=development
ENV PORT=3001
ENV AGENTFLOW_DATA_DIR=/app/data

COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js .nvmrc ./
COPY src ./src
COPY server ./server
RUN npm run build

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3001
CMD ["node", "server/index.js"]
