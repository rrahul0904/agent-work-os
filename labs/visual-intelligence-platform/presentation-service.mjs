import { requireCapability } from './entitlements.mjs';
import { compileDeckPlan } from './deck-plan.mjs';
import { generateNativePptx, nativePptxReceipt } from './pptx-native.mjs';

export function createNativePresentation(input = {}, { includeBytes = true } = {}) {
  const planName = String(input.plan || 'community').toLowerCase();
  requireCapability(planName, 'nativeEditablePptx');
  const deckPlan = compileDeckPlan(input);
  const receipt = nativePptxReceipt(deckPlan);
  return Object.freeze({
    plan: planName,
    deckPlan,
    receipt,
    ...(includeBytes ? { pptx: generateNativePptx(deckPlan) } : {})
  });
}
