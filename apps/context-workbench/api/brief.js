import { answerFromBrief, buildBrief, briefToMarkdown, draftFromBrief, normalizeSources } from "../lib/research-frame.js";
import { assertPublicSourceUrl } from "../lib/safe-url.js";

const MAX_SOURCES = 8;
const MAX_BYTES = 800_000;

function json(res, status, body) {
  res.status(status).setHeader("cache-control", "no-store").setHeader("content-type", "application/json; charset=utf-8").send(JSON.stringify(body));
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
  let url = await assertPublicSourceUrl(rawUrl);
  let response;
  for (let hop = 0; hop < 4; hop++) {
    const fetched = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {"user-agent": "AgentWorkOS-ResearchFrame/1.0"}
    });
    if (fetched.status >= 300 && fetched.status < 400) {
      const next = fetched.headers.get("location");
      if (!next || hop === 3) throw new Error("Source redirect missing or exceeded limit");
      url = await assertPublicSourceUrl(new URL(next, url).toString());
      continue;
    }
    response = fetched;
    break;
  }
  if (!response?.ok) throw new Error("Source fetch failed");
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_BYTES) throw new Error("Source body exceeded the permitted size");
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/") && !type.includes("json") && !type.includes("html")) {
    throw new Error("Unsupported source content type");
  }
  const chunks = [];
  let size = 0;
  if (!response.body) throw new Error("Source body missing");
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_BYTES) throw new Error("Source body exceeded the permitted size");
    chunks.push(Buffer.from(chunk));
  }
  const data = Buffer.concat(chunks).toString("utf8");
  return {
    title: url.hostname,
    url: url.toString(),
    kind: "web",
    text: type.includes("html") ? htmlToText(data) : data.slice(0, 120_000)
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
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > 1_500_000) return json(res, 413, {error: "Request exceeds the 1.5 MB processing limit"});
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
