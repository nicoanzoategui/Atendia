# Monorepo root must be the build context (npm workspaces + shared lockfile).
FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace=backend

FROM deps AS build
COPY backend ./backend
RUN npm run build --workspace=backend

FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace=backend --omit=dev
COPY --from=build /app/backend/dist ./backend/dist
WORKDIR /app/backend
ENV PORT=4001
EXPOSE 4001
CMD ["node", "dist/main.js"]
