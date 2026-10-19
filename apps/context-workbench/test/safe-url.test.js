import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicSourceUrl, isNonPublicAddress } from "../lib/safe-url.js";

test("source fetch rejects local, reserved and IPv4-mapped addresses", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.31.255.2", "192.168.1.1",
    "169.254.169.254", "100.100.100.200", "0.0.0.0", "198.18.0.1",
    "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "2001:db8::1"]) {
    assert.equal(isNonPublicAddress(ip), true, ip);
  }
  assert.equal(isNonPublicAddress("8.8.8.8"), false);
  assert.equal(isNonPublicAddress("2606:4700:4700::1111"), false);
});

test("source URL validation fails closed on DNS answers and unsafe URL forms", async () => {
  const dnsPublic = async () => [{ address: "8.8.8.8" }];
  const dnsLocal = async () => [{ address: "169.254.169.254" }];
  assert.equal((await assertPublicSourceUrl("https://example.org/path", dnsPublic)).hostname, "example.org");
  await assert.rejects(() => assertPublicSourceUrl("https://example.org", dnsLocal), /Private or reserved/);
  await assert.rejects(() => assertPublicSourceUrl("http://localhost/private", dnsPublic), /Local and internal/);
  await assert.rejects(() => assertPublicSourceUrl("http://example.org:8080", dnsPublic), /Nonstandard/);
  await assert.rejects(() => assertPublicSourceUrl("https://user:pass@example.org", dnsPublic), /credentials/);
  await assert.rejects(() => assertPublicSourceUrl("file:\/\/\/etc/passwd", dnsPublic), /HTTP/);
});
