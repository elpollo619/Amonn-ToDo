# ============================================================
# Imagen de Amonn: compila la app web y ejecuta el servidor,
# que sirve tanto la API como la propia web (un solo contenedor).
# ============================================================

# ── Etapa 1: compilar el frontend ───────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /app
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

# ── Etapa 2: servidor (runtime) ─────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /srv
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
# La web compilada se sirve desde aquí (PUBLIC_DIR).
COPY --from=frontend /app/dist ./public
ENV NODE_ENV=production
ENV PUBLIC_DIR=/srv/public
ENV PORT=4000
EXPOSE 4000
CMD ["node", "src/index.js"]
