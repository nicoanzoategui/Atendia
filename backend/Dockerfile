FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS deps
WORKDIR /app/backend
COPY package.json ./
COPY package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS runner
WORKDIR /app/backend
ENV NODE_ENV=production
COPY package.json ./
COPY package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/backend/dist ./dist
ENV PORT=5001
EXPOSE 5001
CMD ["node", "dist/main.js"]
