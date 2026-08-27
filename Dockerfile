# Multi-stage production build for OmniTerm on Linux / Cloud
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts || npm install

COPY . .
RUN npm run build

# Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --only=production --ignore-scripts || npm install --production

COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN addgroup -g 1001 -S omniterm && adduser -u 1001 -S omniterm -G omniterm
USER omniterm

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
