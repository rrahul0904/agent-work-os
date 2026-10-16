FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
ENV AGENT_WORK_OS_HOST=0.0.0.0
EXPOSE 8787
CMD ["node","services/control-api/src/index.js"]
