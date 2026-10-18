import dns from "node:dns/promises";
import net from "node:net";

/** Reject non-routable, private, loopback, documentation and mapped IPs. */
export function isNonPublicAddress(input) {
  const ip = String(input ?? "").replace(/^\[|\]$/g, "").toLowerCase();
  const kind = net.isIP(ip);
  if (kind === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113);
  }
  if (kind === 6) {
    // Globally routable unicast only; mapped/loopback/link-local/ULA fail closed.
    return !/^[23][0-9a-f]{3}:/.test(ip) || ip.startsWith("2001:db8:") ||
      ip.startsWith("2001:0db8:");
  }
  return true;
}

export async function assertPublicSourceUrl(raw, lookup = dns.lookup) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) source URLs are supported");
  if (url.username || url.password) throw new Error("URLs with credentials are not supported");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Nonstandard source URL ports are not supported");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Local and internal source URLs are not allowed");
  }
  const addresses = net.isIP(hostname) ? [{address:hostname}] : await lookup(hostname, {all:true});
  if (!addresses.length || addresses.some(({address}) => isNonPublicAddress(address))) {
    throw new Error("Private or reserved source IP addresses are not allowed");
  }
  return url;
}
