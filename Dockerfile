# ============================================================================
# Imagen del backend Appresso (Node.js + Express + TensorFlow.js)
# ============================================================================

# --- Etapa 1: dependencias de producción ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- Etapa 2: imagen final ---
FROM node:22-alpine
ENV NODE_ENV=production \
    TZ=America/Bogota
WORKDIR /app
RUN apk add --no-cache tzdata
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p logs && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "src/server.js"]
