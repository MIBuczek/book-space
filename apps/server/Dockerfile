# Build the API bundle, then run it on a slim Node image with the production
# dependencies only.
#
# The build stamps `git rev-list --count HEAD` into the version file, so the
# build context must carry full history — a shallow clone fails loudly rather
# than stamping a wrong number (AGENTS.md, "The build number is a task input").

FROM node:24 AS deps
WORKDIR /workspace
COPY package.json yarn.lock ./
# `--production` installs only `dependencies`; the server bundle requires
# nothing from `devDependencies` at runtime. bcrypt is a native addon and is
# compiled here, where the toolchain is present.
RUN yarn install --frozen-lockfile --non-interactive --production

FROM node:24 AS builder
WORKDIR /workspace
COPY . .
RUN yarn install --frozen-lockfile --non-interactive
RUN yarn nx build server --configuration=production

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=builder /workspace/dist/apps/server ./dist/apps/server
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/apps/server/main.js"]
