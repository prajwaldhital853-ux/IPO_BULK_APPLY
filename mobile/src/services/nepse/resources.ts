import { iconUri } from './screener';

const DATA_BASE = 'https://sharehubnepal.com/data/api/v1';

export type TmsBrokerContact = {
  name: string;
  phone: string;
};

export type TmsBrokerRow = {
  id: number;
  code: string;
  name: string;
  tmsLoginUrl: string | null;
  website: string | null;
  address: string | null;
  iconUrl: string | null;
  contacts: TmsBrokerContact[];
};

type Paged<T> = {
  content?: T[];
  totalItems?: number;
  totalPages?: number;
};

type Envelope<T> = {
  data?: T;
};

function str(v: unknown): string {
  return v != null ? String(v).trim() : '';
}

function tmsLoginUrl(raw: string): string | null {
  const host = str(raw);
  if (!host) return null;
  if (/^https?:\/\//i.test(host)) return host;
  return `https://${host}`;
}

export async function loadTmsBrokers(): Promise<TmsBrokerRow[]> {
  const rows: TmsBrokerRow[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= 20) {
    try {
      const res = await fetch(`${DATA_BASE}/broker?page=${page}&size=100`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) break;
      const json = (await res.json()) as Envelope<Paged<Record<string, unknown>>>;
      totalPages = Number(json.data?.totalPages ?? 1);
      for (const raw of json.data?.content ?? []) {
        const contacts = Array.isArray(raw.brokerContacts)
          ? (raw.brokerContacts as Array<Record<string, unknown>>)
              .map((c) => ({
                name: str(c.name) || 'Contact',
                phone: str(c.contactNumber),
              }))
              .filter((c) => c.phone)
          : [];
        rows.push({
          id: Number(raw.id ?? 0),
          code: str(raw.code),
          name: str(raw.name),
          tmsLoginUrl: tmsLoginUrl(str(raw.tmsUrl)),
          website: str(raw.website) || null,
          address: str(raw.address) || null,
          iconUrl: iconUri(str(raw.imageUrl)),
          contacts,
        });
      }
      page += 1;
    } catch {
      break;
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
