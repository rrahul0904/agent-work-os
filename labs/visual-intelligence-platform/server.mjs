import { createVisualIntelligenceServer } from './http-app.mjs';
import { DeterministicTestProvider, ProviderRegistry } from './agent-runtime.mjs';
import { createProviderRegistryFromEnv } from './model-providers.mjs';

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';
const providerRegistry = createProviderRegistryFromEnv(new ProviderRegistry(), process.env);
if (process.env.VISUAL_ENABLE_DETERMINISTIC_PROVIDER === '1') {
  providerRegistry.register('deterministic', new DeterministicTestProvider());
}
const server = createVisualIntelligenceServer({ providerRegistry });

server.on('error', error => {
  console.error('Visual Intelligence server failed:', error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Visual Intelligence Platform listening on http://${host}:${port}; providers=${providerRegistry.names().join(',') || 'none'}`);
});
