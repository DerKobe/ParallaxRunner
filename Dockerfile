# Parallax Runner – production image (Dokku builds this automatically on `git push`)
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data

WORKDIR /app

# dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js CHECKS ./
COPY public ./public
COPY tools ./tools

# persistent data lives here – mount a Dokku storage volume on /app/data
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 3000
CMD ["node", "server.js"]
