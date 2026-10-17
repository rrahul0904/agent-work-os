import dns from "node:dns/promises";
import net from "node:net";
import { answerFromBrief, buildBrief, briefToMarkdown, draftFromBrief, normalizeSources } from "../lib/research-frame.js";

const MAX_SOURCES = 8;
const MAX_BYTES = 800_000;

function json(res, status, body) {
  res.status(status).setHeader("content-type", "application/json; charset=utf-8").send(JSON.stringify(body));
}

function privateIp(ip) {
  if (!net.isIP(ip)) return false;
  if (ip === "::1") return true;
  if (ip.startsWith("10.") || ip.startsWith("127.") || ip.startsWith("169.254.") || ip.startsWith("192.168.")) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:");
}

async function assertPublicUrl(raw) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http/https URLs are supported");
  if (["localhost", "0.0.0.0"].includes(url.hostname)) throw new Error("Local URLs are not allowed");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => privateIp(a.address))) throw new Error("Private-network URLs are not allowed");
  return url;
}

function htmlToText(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120_000);
}

async function fetchSource(rawUrl) {
  const url = await assertPublicUrl(rawUrl);
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
    headers: { "user-agent": "AgentWorkOS-ResearchFrame/1.0" }
  });
  if (!response.ok) throw new Error(`Source fetch failed (${response.status}) for ${url.hostname}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error(`Source too large: ${url.hostname}`);
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/") && !type.includes("json") && !type.includes("html")) {
    throw new Error(`Unsupported source content type: ${type}`);
  }
  const text = await response.text();
  return {
    title: url.hostname,
    url: url.toString(),
    kind: "web",
    text: type.includes("html") ? htmlToText(text) : text.slice(0, 120_000)
  };
}

async function discoverWithBrave(query) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return { configured: false, results: [] };
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "6");
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "x-subscription-token": key
    },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Search provider failed (${response.status})`);
  const data = await response.json();
  return {
    configured: true,
    results: (data.web?.results ?? []).slice(0, 6).map((r) => ({
      title: r.title,
      url: r.url,
      text: r.description ?? "",
      kind: "search-result"
    }))
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST required" });
  try {
    const body = req.body ?? {};
    const action = body.action ?? "create";
    if (action === "ask") {
      const result = answerFromBrief({ brief: body.brief, question: body.question });
      return json(res, 200, { result });
    }
    if (action === "draft") {
      const result = draftFromBrief({ brief: body.brief, format: body.format, audience: body.audience });
      return json(res, 200, { result });
    }
    if (action !== "create") throw new Error(`Unsupported brief action: ${action}`);
    const query = String(body.query ?? "").trim();
    const briefType = body.briefType ?? "source";
    let sources = normalizeSources(body.sources ?? []).slice(0, MAX_SOURCES);
    const warnings = [];

    if (body.discover && query) {
      const discovery = await discoverWithBrave(query);
      if (!discovery.configured) {
        warnings.push("Prompt-to-web discovery is ready but BRAVE_SEARCH_API_KEY is not configured; using supplied sources only.");
      } else {
        sources = normalizeSources([...sources, ...discovery.results]).slice(0, MAX_SOURCES);
      }
    }

    const hydrated = [];
    for (const source of sources) {
      if (source.text?.length >= 80 || !source.url) {
        hydrated.push(source);
        continue;
      }
      try {
        hydrated.push({ ...source, ...(await fetchSource(source.url)) });
      } catch (error) {
        warnings.push(error.message);
        hydrated.push(source);
      }
    }

    const brief = buildBrief({ query, briefType, sources: hydrated });
    return json(res, 200, {
      brief,
      markdown: briefToMarkdown(brief),
      warnings
    });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
}
