# taxonomy-mcp - stateless streamable-HTTP MCP server (port 3002).

# ---- Stage 1: build ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- Stage 2: runtime ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY data/ ./data/
EXPOSE 3002
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3002/healthz || exit 1
CMD ["node", "dist/http.js"]
