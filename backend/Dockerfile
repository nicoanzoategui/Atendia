# Build context: monorepo root (.) — PaaS/CodeBuild: docker build -f backend/Dockerfile .
FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
RUN npm ci --workspace=backend

FROM deps AS build
WORKDIR /app
COPY backend ./backend
RUN npm run build --workspace=backend

FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
RUN npm ci --workspace=backend --omit=dev
COPY --from=build /app/backend/dist ./dist
ENV PORT=4001
EXPOSE 4001
CMD ["node", "dist/main.js"]
