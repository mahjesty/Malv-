import type { MalvRichImageItem, MalvRichSourceItem } from "./malv-rich-response.types";

const MOCK_PATH_SEGMENTS = /\b(malv-mock|\/mock\/|\/demo\/|\/sample\/|\/example\/|\/test-fixture\/)\b/i;

const UNTRUSTED_IMAGE_HOSTS = new Set(
  [
    "picsum.photos",
    "placekitten.com",
    "placehold.co",
    "via.placeholder.com",
    "dummyimage.com",
    "loremflickr.com",
    "fakeimg.pl",
    "unsplash.it"
  ].map((h) => h.toLowerCase())
);

const LOW_VALUE_SOURCE_HOST_SUBSTRINGS = ["malv-mock", "picsum", "example.com", "example.org"];

export function isMalvUntrustedDemonstrationImageUrl(url: string): boolean {
  const t = typeof url === "string" ? url.trim() : "";
  if (!t) return true;
  try {
    const u = new URL(t);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (UNTRUSTED_IMAGE_HOSTS.has(host)) return true;
    if (MOCK_PATH_SEGMENTS.test(u.pathname + u.search)) return true;
    if (/\b(seed\/|random=|random\/)\b/i.test(u.href)) return true;
    return false;
  } catch {
    return true;
  }
}

export function isMalvLowTrustSourceCandidate(args: { url: string; title?: string }): boolean {
  const url = typeof args.url === "string" ? args.url.trim() : "";
  const title = typeof args.title === "string" ? args.title.toLowerCase() : "";
  if (!url) return true;
  try {
    const u = new URL(url);
    if (!/^https:$/i.test(u.protocol)) return true;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local")) return true;
    const hay = `${host} ${u.pathname} ${title}`;
    if (MOCK_PATH_SEGMENTS.test(u.pathname)) return true;
    for (const frag of LOW_VALUE_SOURCE_HOST_SUBSTRINGS) {
      if (hay.includes(frag)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function filterMalvTrustedRichSources(items: MalvRichSourceItem[]): MalvRichSourceItem[] {
  const out: MalvRichSourceItem[] = [];
  const seen = new Set<string>();
  for (const s of items) {
    const url = typeof s.url === "string" ? s.url.trim() : "";
    const title = typeof s.title === "string" ? s.title.trim() : "";
    if (!url || !title) continue;
    if (isMalvLowTrustSourceCandidate({ url, title })) continue;
    let key = "";
    try {
      const u = new URL(url);
      u.hash = "";
      const path = u.pathname.replace(/\/+$/, "") || "/";
      key = `${u.hostname.toLowerCase()}${path}`.toLowerCase();
    } catch {
      key = url.toLowerCase();
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, url });
  }
  return out;
}

export function filterMalvTrustedRichImages(items: MalvRichImageItem[]): MalvRichImageItem[] {
  const out: MalvRichImageItem[] = [];
  const seen = new Set<string>();
  for (const im of items) {
    const url = typeof im.url === "string" ? im.url.trim() : "";
    if (!url || isMalvUntrustedDemonstrationImageUrl(url)) continue;
    const k = url.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      url,
      alt: typeof im.alt === "string" ? im.alt.trim().slice(0, 500) : undefined,
      source: typeof im.source === "string" ? im.source.trim().slice(0, 240) : undefined
    });
  }
  return out;
}
