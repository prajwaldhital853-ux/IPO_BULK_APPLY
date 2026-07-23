/** Multi-source Nepal share / finance news with article images. */

export type NewsSourceId =
  | 'sharesansar'
  | 'merolagani'
  | 'arthakendra'
  | 'corporatekhabar'
  | 'insurancenews'
  | 'bajarkochirfar';

export type NewsSource = {
  id: NewsSourceId;
  label: string;
  site: string;
  homeUrl: string;
  feeds?: string[];
  scrapeUrls?: string[];
};

export type ShareNewsItem = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  imageUrl: string | null;
  sourceId: NewsSourceId;
};

export const NEWS_SOURCES: NewsSource[] = [
  {
    id: 'sharesansar',
    label: 'Share Sansar',
    site: 'sharesansar.com',
    homeUrl: 'https://www.sharesansar.com',
    feeds: [],
    scrapeUrls: [
      'https://www.sharesansar.com/',
      'https://www.sharesansar.com/category/latest',
    ],
  },
  {
    id: 'merolagani',
    label: 'Merolagani',
    site: 'merolagani.com',
    homeUrl: 'https://merolagani.com',
    scrapeUrls: ['https://merolagani.com/NewsList.aspx'],
  },
  {
    id: 'arthakendra',
    label: 'Artha Kendra',
    site: 'arthakendra.com',
    homeUrl: 'https://arthakendra.com',
    scrapeUrls: ['https://arthakendra.com/'],
  },
  {
    id: 'corporatekhabar',
    label: 'Corporate Khabar',
    site: 'corporatekhabar.com',
    homeUrl: 'https://www.corporatekhabar.com',
    feeds: ['https://www.corporatekhabar.com/feed'],
    scrapeUrls: ['https://www.corporatekhabar.com/'],
  },
  {
    id: 'insurancenews',
    label: 'Insurance News',
    site: 'insurancenews.com.np',
    homeUrl: 'https://insurancenews.com.np',
    feeds: ['https://insurancenews.com.np/feed'],
  },
  {
    id: 'bajarkochirfar',
    label: 'Bajarko Chirfar',
    site: 'bajarkochirfar.com',
    homeUrl: 'https://bajarkochirfar.com',
    feeds: ['https://bajarkochirfar.com/feed'],
  },
];

const UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';

/** First paint size — rest loads in background. */
export const NEWS_FIRST_PAGE = 8;

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function pickTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeXml(m[1]) : '';
}

function pickAttr(block: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["'][^>]*/?>`, 'i');
  const m = block.match(re);
  return m ? decodeXml(m[1]) : '';
}

function extractImage(block: string): string | null {
  const media =
    pickAttr(block, 'media:content', 'url') ||
    pickAttr(block, 'media:thumbnail', 'url') ||
    pickAttr(block, 'enclosure', 'url');
  if (
    media &&
    /^https?:\/\//i.test(media) &&
    !/favicon|logo|sprite/i.test(media)
  ) {
    return media;
  }
  const desc =
    pickTag(block, 'description') || pickTag(block, 'content:encoded');
  const imgs = [...desc.matchAll(/src=["'](https?:[^"']+)["']/gi)].map(
    (m) => m[1],
  );
  for (const src of imgs) {
    if (!/favicon|logo|sprite|emoji|1x1|pixel/i.test(src)) return src;
  }
  return null;
}

function resolveArticleUrl(block: string, link: string): string {
  let url = link.trim();
  const gu = pickTag(block, 'guid');
  if (
    /news\.google\.com/i.test(url) &&
    gu &&
    /^https?:\/\//i.test(gu) &&
    !/news\.google\.com/i.test(gu)
  ) {
    url = gu;
  }
  const urlMatch = url.match(/[?&]url=([^&]+)/i);
  if (urlMatch) {
    try {
      url = decodeURIComponent(urlMatch[1]);
    } catch {
      // keep
    }
  }
  if (/news\.google\.com/i.test(url)) {
    const desc =
      pickTag(block, 'description') || pickTag(block, 'content:encoded');
    const href = desc.match(
      /href=["'](https?:\/\/(?!news\.google\.com)[^"']+)["']/i,
    );
    if (href?.[1]) url = decodeXml(href[1]);
  }
  return url;
}

function googleRssUrl(site: string): string {
  const q = encodeURIComponent(`site:${site}`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-NP&gl=NP&ceid=NP:en`;
}

function parseRssItems(
  xml: string,
  sourceId: NewsSourceId,
): ShareNewsItem[] {
  const chunks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const out: ShareNewsItem[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const block = chunks[i];
    const title = pickTag(block, 'title')
      .replace(/\s*-\s*ShareSansar\s*$/i, '')
      .replace(/\s*\|\s*.*$/, '')
      .trim();
    const rawLink = pickTag(block, 'link') || pickTag(block, 'guid');
    const pubDate = pickTag(block, 'pubDate');
    if (!title || !rawLink) continue;
    const url = resolveArticleUrl(block, rawLink);
    const gLink = /news\.google\.com/i.test(rawLink) ? rawLink.trim() : null;
    if (!/^https?:\/\//i.test(url) && !gLink) continue;
    out.push({
      id: `${sourceId}-${i}-${title.slice(0, 24)}`,
      title,
      url: /^https?:\/\//i.test(url) ? url : (gLink as string),
      publishedAt: pubDate || new Date().toISOString(),
      imageUrl: extractImage(block),
      sourceId,
    });
    if (gLink) googleLinkById.set(out[out.length - 1].id, gLink);
  }
  return out;
}

const googleLinkById = new Map<string, string>();

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/html,application/rss+xml,application/xml,text/xml,*/*',
        'User-Agent': UA,
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractOgImage(html: string): string | null {
  const patterns = [
    /property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)/i,
    /content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i,
    /name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)/i,
    /content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i,
    /rel=["']image_src["'][^>]*href=["']([^"']+)/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (
      m?.[1] &&
      /^https?:\/\//i.test(m[1]) &&
      !/favicon|logo\.svg/i.test(m[1])
    ) {
      return encodeImageUrl(m[1].replace(/&amp;/g, '&'));
    }
  }
  const lh = html.match(
    /(https:\/\/lh3\.googleusercontent\.com\/[^"'>\s]+)/i,
  );
  if (lh?.[1]) return encodeImageUrl(lh[1]);
  return null;
}

function encodeImageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.pathname = u.pathname
      .split('/')
      .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
      .join('/');
    return u.toString();
  } catch {
    return url.replace(/ /g, '%20');
  }
}

function extractPageTitle(html: string): string {
  const og = html.match(
    /property=["']og:title["'][^>]*content=["']([^"']+)/i,
  );
  if (og?.[1]) return decodeXml(og[1]);
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return t ? decodeXml(t[1]).replace(/\s*[|\-–].*$/, '').trim() : '';
}

function slugTitle(slug: string): string {
  return slug
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function dateFromSlug(slug: string): string | null {
  const m = slug.match(/(\d{4}-\d{2}-\d{2})$/);
  return m ? new Date(`${m[1]}T12:00:00`).toUTCString() : null;
}

function absUrl(base: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () =>
      worker(),
    ),
  );
  return out;
}

/** Merolagani NewsList — cards already include title + thumbnail. */
function scrapeMerolaganiList(html: string): ShareNewsItem[] {
  const chunks = html.split(/class="media-news[^"]*"/i).slice(1);
  const seen = new Set<string>();
  const out: ShareNewsItem[] = [];
  for (const chunk of chunks) {
    const idMatch = chunk.match(/NewsDetail\.aspx\?newsID=(\d+)/i);
    if (!idMatch) continue;
    const newsId = idMatch[1];
    if (seen.has(newsId)) continue;
    seen.add(newsId);
    const img =
      chunk.match(
        /src=["'](https?:\/\/images\.merolagani\.com[^"']+)["']/i,
      )?.[1] ?? null;
    const titleRaw =
      chunk.match(/class="media-title"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ??
      chunk.match(/<img[^>]+alt=["']([^"']+)["']/i)?.[1] ??
      '';
    const title = decodeXml(titleRaw.replace(/<[^>]+>/g, '')).trim();
    if (!title) continue;
    const dateLabel =
      chunk.match(/class="media-label"[^>]*>([\s\S]*?)<\//i)?.[1] ?? '';
    const dateText = decodeXml(dateLabel.replace(/<[^>]+>/g, '')).trim();
    let publishedAt = new Date().toISOString();
    if (dateText) {
      const parsed = Date.parse(dateText);
      if (!Number.isNaN(parsed)) publishedAt = new Date(parsed).toISOString();
    }
    out.push({
      id: `merolagani-${newsId}`,
      title,
      url: `https://merolagani.com/NewsDetail.aspx?newsID=${newsId}`,
      publishedAt,
      imageUrl: img ? encodeImageUrl(img.replace(/\\/g, '/')) : null,
      sourceId: 'merolagani',
    });
  }
  return out;
}

/** Artha Kendra home — /news/{id} cards with CDN images + entity titles. */
function scrapeArthaKendraHome(html: string): ShareNewsItem[] {
  const seen = new Set<string>();
  const out: ShareNewsItem[] = [];
  const hrefRe = /href=["'](\/news\/(\d+))["']/gi;
  let m;
  while ((m = hrefRe.exec(html))) {
    const path = m[1];
    const newsId = m[2];
    if (seen.has(newsId)) continue;
    seen.add(newsId);
    const start = m.index;
    const block = html.slice(start, start + 1400);
    const img =
      block.match(
        /(?:src=["']|url\()["']?(https?:\/\/cdn\.arthakendra\.com\/[^"')\s]+)/i,
      )?.[1] ?? null;
    const titleRaw =
      block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1] ?? '';
    const title = decodeXml(titleRaw.replace(/<[^>]+>/g, '')).trim();
    if (!title || title.length < 8) continue;
    // Skip tiny UI labels that aren't headlines
    if (/^(होम|Home|थप|More)$/i.test(title)) continue;
    out.push({
      id: `arthakendra-${newsId}`,
      title,
      url: absUrl('https://arthakendra.com/', path),
      publishedAt: new Date().toISOString(),
      imageUrl: img ? encodeImageUrl(img.replace(/\\/g, '/')) : null,
      sourceId: 'arthakendra',
    });
  }
  return out;
}

async function scrapeShareSansarLinks(): Promise<string[]> {
  const listingUrls = [
    'https://www.sharesansar.com/',
    'https://www.sharesansar.com/category/latest',
  ];
  const linkSet = new Set<string>();
  for (const page of listingUrls) {
    const html = await fetchText(page);
    if (!html) continue;
    const matches = html.matchAll(
      /https?:\/\/www\.sharesansar\.com\/newsdetail\/[a-z0-9-]+/gi,
    );
    for (const m of matches) linkSet.add(m[0].split('?')[0]);
  }
  return [...linkSet]
    .sort((a, b) => {
      const da = a.match(/(\d{4}-\d{2}-\d{2})$/)?.[1] ?? '';
      const db = b.match(/(\d{4}-\d{2}-\d{2})$/)?.[1] ?? '';
      return db.localeCompare(da);
    })
    .slice(0, 28);
}

async function fetchShareSansarArticles(
  links: string[],
): Promise<ShareNewsItem[]> {
  const pages = await mapPool(links, 6, async (url) => {
    const html = await fetchText(url);
    if (!html) return null;
    const slug = url.split('/').pop() ?? '';
    const title = extractPageTitle(html) || slugTitle(slug);
    const imageUrl = extractOgImage(html);
    const publishedAt =
      dateFromSlug(slug) ||
      (() => {
        const m = html.match(
          /property=["']article:published_time["'][^>]*content=["']([^"']+)/i,
        );
        return m?.[1] ?? new Date().toISOString();
      })();
    if (!title) return null;
    return {
      id: `sharesansar-${slug}`,
      title,
      url,
      publishedAt,
      imageUrl,
      sourceId: 'sharesansar' as const,
    } satisfies ShareNewsItem;
  });
  return pages.filter((p): p is ShareNewsItem => p != null);
}

async function enrichImages(items: ShareNewsItem[]): Promise<ShareNewsItem[]> {
  const need = items
    .map((it, index) => ({ it, index }))
    .filter(({ it }) => !it.imageUrl);

  await mapPool(need, 5, async ({ it, index }) => {
    const candidates = [googleLinkById.get(it.id), it.url].filter(
      (u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u),
    );
    for (const u of candidates) {
      const html = await fetchText(u);
      if (!html) continue;
      const img = extractOgImage(html);
      if (img) {
        items[index] = { ...items[index], imageUrl: img };
        break;
      }
    }
    return null;
  });

  return items;
}

async function fetchRss(url: string): Promise<string | null> {
  const text = await fetchText(url);
  if (!text || !/<item[\s\S]*?<\/item>/i.test(text)) return null;
  return text;
}

function mergeUnique(
  prev: ShareNewsItem[],
  next: ShareNewsItem[],
): ShareNewsItem[] {
  const seen = new Set(prev.map((p) => p.id));
  const out = [...prev];
  for (const n of next) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out;
}

/**
 * Progressive news load: paints first page quickly, then streams the rest.
 * `onUpdate(items, { done })` is called at least once with the first page.
 */
export async function loadShareNewsProgressive(
  sourceId: NewsSourceId,
  onUpdate: (
    items: ShareNewsItem[],
    meta: { done: boolean; phase: 'first' | 'more' },
  ) => void,
): Promise<ShareNewsItem[]> {
  const source = NEWS_SOURCES.find((s) => s.id === sourceId);
  if (!source) {
    onUpdate([], { done: true, phase: 'first' });
    return [];
  }

  // ——— Merolagani: listing HTML has titles + images (no Google RSS) ———
  if (sourceId === 'merolagani') {
    const html = await fetchText('https://merolagani.com/NewsList.aspx');
    const all = html ? scrapeMerolaganiList(html) : [];
    const first = all.slice(0, NEWS_FIRST_PAGE);
    onUpdate(first, { done: all.length <= NEWS_FIRST_PAGE, phase: 'first' });
    if (all.length > NEWS_FIRST_PAGE) {
      onUpdate(all.slice(0, 40), { done: true, phase: 'more' });
    }
    return all.slice(0, 40);
  }

  // ——— Artha Kendra: scrape home (feed 404s) ———
  if (sourceId === 'arthakendra') {
    const html = await fetchText('https://arthakendra.com/');
    const all = html ? scrapeArthaKendraHome(html) : [];
    const first = all.slice(0, NEWS_FIRST_PAGE);
    onUpdate(first, { done: all.length <= NEWS_FIRST_PAGE, phase: 'first' });
    if (all.length > NEWS_FIRST_PAGE) {
      onUpdate(all.slice(0, 40), { done: true, phase: 'more' });
    }
    return all.slice(0, 40);
  }

  // ——— ShareSansar: first N article pages, then rest ———
  if (sourceId === 'sharesansar') {
    try {
      const links = await scrapeShareSansarLinks();
      if (links.length) {
        const firstLinks = links.slice(0, NEWS_FIRST_PAGE);
        const first = await fetchShareSansarArticles(firstLinks);
        onUpdate(first, {
          done: links.length <= NEWS_FIRST_PAGE,
          phase: 'first',
        });
        if (links.length > NEWS_FIRST_PAGE) {
          const rest = await fetchShareSansarArticles(
            links.slice(NEWS_FIRST_PAGE),
          );
          const merged = mergeUnique(first, rest).slice(0, 40);
          onUpdate(merged, { done: true, phase: 'more' });
          return merged;
        }
        return first;
      }
    } catch {
      // fall through to RSS
    }
  }

  // ——— RSS / Google News fallback ———
  googleLinkById.clear();
  const candidates = [...(source.feeds ?? []), googleRssUrl(source.site)];
  let items: ShareNewsItem[] = [];
  for (const feedUrl of candidates) {
    const xml = await fetchRss(feedUrl);
    if (!xml) continue;
    items = parseRssItems(xml, sourceId);
    if (items.length) break;
  }
  if (!items.length) {
    onUpdate([], { done: true, phase: 'first' });
    return [];
  }

  const first = items.slice(0, NEWS_FIRST_PAGE);
  onUpdate(first, { done: false, phase: 'first' });

  // Enrich images in background (first page first, then rest)
  const enrichedFirst = await enrichImages([...first]);
  onUpdate(enrichedFirst, {
    done: items.length <= NEWS_FIRST_PAGE,
    phase: 'more',
  });

  if (items.length > NEWS_FIRST_PAGE) {
    const rest = items.slice(NEWS_FIRST_PAGE, 40);
    const enrichedRest = await enrichImages([...rest]);
    const merged = mergeUnique(enrichedFirst, enrichedRest).slice(0, 40);
    onUpdate(merged, { done: true, phase: 'more' });
    return merged;
  }

  return enrichedFirst;
}

/** Full load (non-progressive) — used by callers that don’t stream. */
export async function loadShareNews(
  sourceId: NewsSourceId,
): Promise<ShareNewsItem[]> {
  let final: ShareNewsItem[] = [];
  await loadShareNewsProgressive(sourceId, (items, meta) => {
    if (meta.done || meta.phase === 'first') final = items;
  });
  return final;
}

/** Screenshot style: Mon, Jul 20, 2026 05:05 PM */
export function formatNewsTime(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const weekday = d.toLocaleString('en-US', { weekday: 'short' });
  const month = d.toLocaleString('en-US', { month: 'short' });
  const day = d.getDate();
  const year = d.getFullYear();
  let hour = d.getHours();
  const minute = String(d.getMinutes()).padStart(2, '0');
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  const hh = String(hour).padStart(2, '0');
  return `${weekday}, ${month} ${day}, ${year} ${hh}:${minute} ${ampm}`;
}
