# Dev-friendly Dockerfile; use compose to mount sources
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm install --legacy-peer-deps || true
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
