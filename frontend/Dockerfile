# ============================================================================
# Imagen del frontend Appresso (React + Vite compilado, servido por nginx)
# ============================================================================

# --- Etapa 1: build de Vite ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Por defecto el navegador llama a /api y nginx lo reenvía al backend
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- Etapa 2: nginx sirviendo los estáticos ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
