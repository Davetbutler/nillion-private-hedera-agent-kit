# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

WORKDIR /app

# Install deps first for better layer caching
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy the rest
COPY . .

# Expose the web port
EXPOSE 3000

# Default environment (can be overridden at runtime)
ENV NODE_ENV=production

# Start the web server
CMD ["npm", "run", "start"]


