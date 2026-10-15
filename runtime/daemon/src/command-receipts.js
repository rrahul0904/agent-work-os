export function createCommandReceiptCache(maxEntries = 2_000) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error("command_receipt_cache_limit_invalid");
  const receipts = new Map();
  const inFlight = new Set();
  return {
    begin(commandId) {
      if (receipts.has(commandId)) return { kind: "duplicate", receipt: receipts.get(commandId) };
      if (inFlight.has(commandId)) return { kind: "in_flight" };
      inFlight.add(commandId);
      return { kind: "new" };
    },
    complete(commandId, receipt) {
      inFlight.delete(commandId);
      receipts.set(commandId, receipt);
      while (receipts.size > maxEntries) receipts.delete(receipts.keys().next().value);
    }
  };
}
