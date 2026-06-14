# ===== Dockerfile cho Next.js (Frontend) =====
# Multi-stage build: deps -> dev runner

FROM node:20-alpine

WORKDIR /app

# Cài deps trước để tận dụng Docker layer cache
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

EXPOSE 3000

# Hot-reload trong dev
CMD ["npm", "run", "dev"]
