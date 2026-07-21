/** Multi-source Nepal share / finance news with article images. */

export type NewsSourceId =
  | 'sharesansar'
  | 'merolagani'
  | 'arthakendra'
  | 'corporatekhabar'
  | 'insurancenews'
  | 'bajarkochirfar'
  | 'arthasansar'
  | 'arthasarokar';

export type NewsSource = {
  id: NewsSourceId;
  label: string;
  site: string;
  homeUrl: string;
  feeds?: string[];
  /** HTML pages to scrape for article links (with images). */
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
    feeds: ['https://arthakendra.com/feed'],
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
  {
    id: 'arthasansar',
    label: 'Artha Sansar',
    site: 'arthasansar.com',
    homeUrl: 'https://www.arthasansar.com',
    feeds: ['https://www.arthasansar.com/feed'],
  },
  {
    id: 'arthasarokar',
    label: 'Artha Sarokar',
    site: 'arthasarokar.com',
    homeUrl: 'https://www.arthasarokar.com',
    feeds: ['https://www.arthasarokar.com/feed'],
  },
];

const UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
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
  if (media && /^https?:\/\//i.test(media) && !/favicon|logo|sprite/i.test(media)) {
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

/** Google News article URLs used only for og:image enrichment. */
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
    if (m?.[1] && /^https?:\/\//i.test(m[1]) && !/favicon|logo\.svg/i.test(m[1])) {
      return encodeImageUrl(m[1].replace(/&amp;/g, '&'));
    }
  }
  // Google News sometimes embeds lh3 thumbnails
  const lh = html.match(
    /(https:\/\/lh3\.googleusercontent\.com\/[^"'>\s]+)/i,
  );
  if (lh?.[1]) return encodeImageUrl(lh[1]);
  return null;
}

/** Encode spaces / unsafe chars in image path while keeping URL structure. */
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
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return out;
}

/** ShareSansar: collect newsdetail URLs then pull og:image from each article. */
async function scrapeShareSansar(
  sourceId: NewsSourceId,
): Promise<ShareNewsItem[]> {
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
  const links = [...linkSet]
    .sort((a, b) => {
      const da = a.match(/(\d{4}-\d{2}-\d{2})$/)?.[1] ?? '';
      const db = b.match(/(\d{4}-\d{2}-\d{2})$/)?.[1] ?? '';
      return db.localeCompare(da);
    })
    .slice(0, 28);
  if (!links.length) return [];

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
      sourceId,
    } satisfies ShareNewsItem;
  });

  return pages.filter((p): p is ShareNewsItem => p != null);
}

/** Enrich missing images by fetching og:image from article / Google News URLs. */
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

export async function loadShareNews(
  sourceId: NewsSourceId,
): Promise<ShareNewsItem[]> {
  const source = NEWS_SOURCES.find((s) => s.id === sourceId);
  if (!source) return [];

  // Prefer site scrape for ShareSansar (reliable images + direct URLs)
  if (sourceId === 'sharesansar') {
    try {
      const scraped = await scrapeShareSansar(sourceId);
      if (scraped.length) {
        const withImages = scraped.filter((s) => s.imageUrl).length;
        if (withImages > 0) return scraped.slice(0, 40);
      }
    } catch {
      // fall through
    }
  }

  const candidates = [
    ...(source.feeds ?? []),
    googleRssUrl(source.site),
  ];

  googleLinkById.clear();
  let items: ShareNewsItem[] = [];
  for (const feedUrl of candidates) {
    const xml = await fetchRss(feedUrl);
    if (!xml) continue;
    items = parseRssItems(xml, sourceId);
    if (items.length) break;
  }

  if (!items.length) return [];

  // Match ShareSansar Google titles to local newsdetail links for better images
  if (sourceId === 'sharesansar') {
    const home = await fetchText('https://www.sharesansar.com/');
    if (home) {
      const linkMap = new Map<string, string>();
      for (const m of home.matchAll(
        /https?:\/\/www\.sharesansar\.com\/newsdetail\/([a-z0-9-]+)/gi,
      )) {
        const slug = m[1];
        const key = slug.replace(/-\d{4}-\d{2}-\d{2}$/, '').toLowerCase();
        linkMap.set(key, m[0].split('?')[0]);
      }
      items = items.map((it) => {
        const key = it.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        // find best slug start match
        let best: string | null = null;
        for (const [slugKey, url] of linkMap) {
          if (key.includes(slugKey.slice(0, 28)) || slugKey.includes(key.slice(0, 28))) {
            best = url;
            break;
          }
        }
        return best ? { ...it, url: best } : it;
      });
    }
  }

  return (await enrichImages(items)).slice(0, 40);
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
