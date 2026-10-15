import { createVisualIntelligenceServer } from './http-app.mjs';

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';
const server = createVisualIntelligenceServer();

server.on('error', error => {
  console.error('Visual Intelligence server failed:', error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Visual Intelligence Platform listening on http://${host}:${port}`);
});
