# Build the Angular bundle, then serve it from nginx, which also proxies `/api`
# to the API container. The UI issues relative `/api` requests, so the proxy is
# what makes the same bundle work behind any host name.

FROM node:24 AS builder
WORKDIR /workspace
COPY . .
RUN yarn install --frozen-lockfile --non-interactive
RUN yarn nx build ui --configuration=production

FROM nginx:alpine AS runtime
COPY --from=builder /workspace/dist/apps/ui /usr/share/nginx/html
COPY apps/ui/nginx.conf.template /etc/nginx/templates/default.conf.template
# The upstream API is resolved from the environment at container start, so the
# image is not tied to a compose service name.
ENV API_UPSTREAM=http://server:3000
EXPOSE 80
