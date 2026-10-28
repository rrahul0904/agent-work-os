FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY . .
ENV AGENT_WORK_OS_HOST=0.0.0.0
EXPOSE 8787
CMD ["node","services/control-api/src/index.js"]
