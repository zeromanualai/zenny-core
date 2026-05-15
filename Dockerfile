# Zenny Core — Production Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Railway provides PORT env var, default to 3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
