# Stage 1: Build
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
# COPY .npmrc ./
COPY tsconfig.base.json ./

# Copy all packages
COPY packages/ ./packages/

# Install deps
RUN pnpm install --frozen-lockfile

# Build
RUN pnpm --filter @onfile/app build

# Stage 2: Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/packages/app/dist /usr/share/nginx/html
COPY packages/app/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
