# The cellar app: built UI, API and nightly sync in one Node process.
#
#   docker compose up -d --build
#
# Node runs the TypeScript directly (type stripping), so the runtime image has
# no compiler and no node_modules: the server uses only Node's built-ins.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
# tzdata so TZ=Europe/London gives local time, and the nightly run follows BST.
RUN apk add --no-cache tzdata
ENV NODE_ENV=production \
    PORT=8080 \
    TZ=Europe/London \
    NIGHTLY_SYNC_AT=03:00
WORKDIR /app

COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY --from=build /app/dist ./dist

# data/ is a mount in practice; this just gives the node user somewhere to write.
RUN mkdir -p data && chown node:node data
USER node

EXPOSE 8080
CMD ["node", "scripts/serve.ts"]
