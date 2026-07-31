import type { AccountMeta } from '../types/account';
import type { ImportedHolding } from '../services/meroshare/portfolioImport';

export const MOCK_ID_PREFIX = 'mock_';

export function isMockAccountId(id: string): boolean {
  return id.startsWith(MOCK_ID_PREFIX);
}

export type MockAccountSeed = {
  meta: AccountMeta;
  secrets: { password: string; crn: string; pin: string };
  holdings: ImportedHolding[];
  /**
   * Optional expiry overrides so Track Account Expiry shows real-style
   * expired demat / password states for some sample accounts.
   */
  expiry?: {
    passwordExpiryDate?: string; // YYYY-MM-DD
    dematExpiryDate?: string;
    meroshareExpiryDate?: string;
  };
};

type StockQuote = {
  symbol: string;
  name: string;
  ltp: number;
  previousClosingPrice: number;
};

/** Live-style NEPSE quotes used to build realistic gain/loss holdings. */
const QUOTES: StockQuote[] = [
  { symbol: 'NABIL', name: 'Nabil Bank Limited', ltp: 905, previousClosingPrice: 898 },
  { symbol: 'NICA', name: 'NIC Asia Bank Limited', ltp: 688, previousClosingPrice: 695 },
  { symbol: 'GBIME', name: 'Global IME Bank Limited', ltp: 278, previousClosingPrice: 272 },
  { symbol: 'SBL', name: 'Siddhartha Bank Limited', ltp: 268, previousClosingPrice: 262 },
  { symbol: 'HIDCL', name: 'Hydroelectricity Investment and Development Company', ltp: 212, previousClosingPrice: 208 },
  { symbol: 'UPPER', name: 'Upper Tamakoshi Hydropower', ltp: 465, previousClosingPrice: 470 },
  { symbol: 'CHCL', name: 'Chilime Hydropower Company', ltp: 395, previousClosingPrice: 402 },
  { symbol: 'API', name: 'Api Power Company Ltd.', ltp: 162, previousClosingPrice: 158 },
  { symbol: 'SHIVM', name: 'Shivam Cement Limited', ltp: 548, previousClosingPrice: 540 },
  { symbol: 'NLIC', name: 'Nepal Life Insurance Co. Ltd.', ltp: 940, previousClosingPrice: 955 },
  { symbol: 'HDL', name: 'Himalayan Distillery Limited', ltp: 1920, previousClosingPrice: 1895 },
  { symbol: 'NRIC', name: 'Nepal Reinsurance Company', ltp: 598, previousClosingPrice: 610 },
  { symbol: 'NIFRA', name: 'Nepal Infrastructure Bank', ltp: 245, previousClosingPrice: 238 },
  { symbol: 'NMB', name: 'NMB Bank Limited', ltp: 255, previousClosingPrice: 249 },
  { symbol: 'PCBL', name: 'Prime Commercial Bank', ltp: 228, previousClosingPrice: 232 },
];

type PersonSeed = {
  slug: string;
  name: string;
  dpId: string;
  dpName: string;
  username: string;
  bankName: string;
  accountNumber: string;
  /** Indices into QUOTES */
  stockIdx: number[];
  /** Qty per selected stock */
  qtys: number[];
  /** WACC multiplier vs LTP (e.g. 0.9 = bought cheaper → gain) */
  waccVsLtp: number[];
  /** demat | password | both | none */
  expiryKind?: 'demat' | 'password' | 'both' | 'none';
};

const PEOPLE: PersonSeed[] = [
  {
    slug: 'prajwal',
    name: 'PRAJWAL DHITAL',
    dpId: '13200',
    dpName: 'NIBL ACE CAPITAL LTD',
    username: '07032591',
    bankName: 'NIC ASIA BANK LTD.',
    accountNumber: '0542012345678901',
    stockIdx: [0, 1, 4, 5],
    qtys: [120, 85, 200, 50],
    waccVsLtp: [0.91, 1.03, 0.87, 1.03],
    expiryKind: 'none',
  },
  {
    slug: 'sita',
    name: 'SITA SHARMA',
    dpId: '12300',
    dpName: 'NMB CAPITAL LTD',
    username: '08145220',
    bankName: 'NMB BANK LTD.',
    accountNumber: '0120123456789012',
    stockIdx: [0, 8, 9],
    qtys: [40, 150, 30],
    waccVsLtp: [0.95, 0.95, 1.04],
    expiryKind: 'demat',
  },
  {
    slug: 'ram',
    name: 'RAM BAHADUR THAPA',
    dpId: '11700',
    dpName: 'CIVIL CAPITAL MARKET LTD',
    username: '06511880',
    bankName: 'GLOBAL IME BANK LTD.',
    accountNumber: '0401987654321001',
    stockIdx: [2, 6, 7, 1],
    qtys: [95, 60, 250, 20],
    waccVsLtp: [0.95, 1.04, 0.9, 1.02],
    expiryKind: 'password',
  },
  {
    slug: 'anita',
    name: 'ANITA KC',
    dpId: '14900',
    dpName: 'PRABHU CAPITAL LTD',
    username: '09233441',
    bankName: 'PRABHU BANK LTD.',
    accountNumber: '0211556677889900',
    stockIdx: [3, 10, 11],
    qtys: [75, 15, 100],
    waccVsLtp: [0.95, 0.96, 1.04],
    expiryKind: 'both',
  },
  {
    slug: 'bikash',
    name: 'BIKASH ADHIKARI',
    dpId: '11900',
    dpName: 'SIDDHARTHA CAPITAL LTD',
    username: '07822110',
    bankName: 'SIDDHARTHA BANK LTD.',
    accountNumber: '0188011223344556',
    stockIdx: [12, 13, 2],
    qtys: [180, 110, 45],
    waccVsLtp: [0.92, 0.94, 1.01],
    expiryKind: 'demat',
  },
  {
    slug: 'sunita',
    name: 'SUNITA GURUNG',
    dpId: '12800',
    dpName: 'LAXMI CAPITAL LTD',
    username: '08566772',
    bankName: 'LAXMI SUNRISE BANK LTD.',
    accountNumber: '0333444555666777',
    stockIdx: [4, 7, 14],
    qtys: [300, 120, 90],
    waccVsLtp: [0.88, 0.93, 1.05],
    expiryKind: 'none',
  },
  {
    slug: 'dipesh',
    name: 'DIPESH MAHARJAN',
    dpId: '13400',
    dpName: 'MACHHAPUCHCHHRE CAPITAL LTD',
    username: '07199881',
    bankName: 'MACHHAPUCHCHHRE BANK LTD.',
    accountNumber: '0777888999000111',
    stockIdx: [5, 8, 0],
    qtys: [70, 80, 25],
    waccVsLtp: [1.02, 0.97, 0.9],
    expiryKind: 'password',
  },
  {
    slug: 'kabita',
    name: 'KABITA RAI',
    dpId: '11100',
    dpName: 'NABIL INVESTMENT BANKING LTD',
    username: '06955443',
    bankName: 'NABIL BANK LTD.',
    accountNumber: '0100223344556677',
    stockIdx: [9, 11, 3],
    qtys: [55, 140, 60],
    waccVsLtp: [1.03, 0.96, 0.98],
    expiryKind: 'none',
  },
  {
    slug: 'hari',
    name: 'HARI PRASAD POUDEL',
    dpId: '14500',
    dpName: 'CITIZENS CAPITAL LTD',
    username: '08811223',
    bankName: 'CITIZENS BANK INTERNATIONAL LTD.',
    accountNumber: '0666777888999000',
    stockIdx: [6, 12, 13],
    qtys: [100, 220, 50],
    waccVsLtp: [1.01, 0.91, 1.04],
    expiryKind: 'demat',
  },
  {
    slug: 'manisha',
    name: 'MANISHA SHRESTHA',
    dpId: '15200',
    dpName: 'SANIMA CAPITAL LTD',
    username: '09477889',
    bankName: 'SANIMA BANK LTD.',
    accountNumber: '0444555666777888',
    stockIdx: [10, 1, 7],
    qtys: [12, 150, 180],
    waccVsLtp: [0.97, 0.99, 0.89],
    expiryKind: 'none',
  },
  {
    slug: 'ramesh',
    name: 'RAMESH BASNET',
    dpId: '12000',
    dpName: 'HIMALAYAN CAPITAL LTD',
    username: '07633445',
    bankName: 'HIMALAYAN BANK LTD.',
    accountNumber: '0255666777888999',
    stockIdx: [14, 2, 4],
    qtys: [130, 70, 160],
    waccVsLtp: [1.02, 0.96, 0.94],
    expiryKind: 'password',
  },
  {
    slug: 'gita',
    name: 'GITA TAMANG',
    dpId: '13600',
    dpName: 'JYOTI BIKASH BANK CAPITAL',
    username: '08344556',
    bankName: 'JYOTI BIKAS BANK LTD.',
    accountNumber: '0888999000111222',
    stockIdx: [8, 5, 11],
    qtys: [95, 40, 75],
    waccVsLtp: [0.93, 1.05, 1.02],
    expiryKind: 'both',
  },
  {
    slug: 'nabin',
    name: 'NABIN KARKI',
    dpId: '12900',
    dpName: 'KUMARI CAPITAL LTD',
    username: '07255667',
    bankName: 'KUMARI BANK LTD.',
    accountNumber: '0111222333444555',
    stockIdx: [0, 3, 12],
    qtys: [60, 200, 110],
    waccVsLtp: [0.92, 0.97, 1.01],
    expiryKind: 'none',
  },
  {
    slug: 'sarita',
    name: 'SARITA MAGAR',
    dpId: '14000',
    dpName: 'NEPAL SBI MERCHANT BANKING',
    username: '09066778',
    bankName: 'NEPAL SBI BANK LTD.',
    accountNumber: '0999000111222333',
    stockIdx: [13, 6, 9],
    qtys: [85, 55, 20],
    waccVsLtp: [0.95, 0.99, 1.06],
    expiryKind: 'demat',
  },
  {
    slug: 'prakash',
    name: 'PRAKASH YADAV',
    dpId: '11500',
    dpName: 'AGRICULTURE DEVELOPMENT BANK CAPITAL',
    username: '06788990',
    bankName: 'AGRICULTURE DEVELOPMENT BANK LTD.',
    accountNumber: '0166777888999001',
    stockIdx: [7, 14, 1, 10],
    qtys: [210, 100, 35, 8],
    waccVsLtp: [0.9, 1.03, 1.01, 0.98],
    expiryKind: 'none',
  },
];

function buildHoldings(person: PersonSeed): ImportedHolding[] {
  return person.stockIdx.map((qi, i) => {
    const q = QUOTES[qi]!;
    const qty = person.qtys[i] ?? 50;
    const mult = person.waccVsLtp[i] ?? 1;
    return {
      symbol: q.symbol,
      name: q.name,
      qty,
      wacc: Math.round(q.ltp * mult),
      ltp: q.ltp,
      previousClosingPrice: q.previousClosingPrice,
    };
  });
}

function ymdOffset(daysFromToday: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function expiryFor(kind: PersonSeed['expiryKind']): MockAccountSeed['expiry'] {
  // Valid defaults: password ~90d, demat ~330d, meroshare ~400d
  const passwordOk = ymdOffset(90);
  const dematOk = ymdOffset(330);
  const meroOk = ymdOffset(400);
  if (kind === 'demat') {
    return {
      passwordExpiryDate: passwordOk,
      dematExpiryDate: ymdOffset(-12), // expired ~12 days ago
      meroshareExpiryDate: meroOk,
    };
  }
  if (kind === 'password') {
    return {
      passwordExpiryDate: ymdOffset(-5),
      dematExpiryDate: dematOk,
      meroshareExpiryDate: meroOk,
    };
  }
  if (kind === 'both') {
    return {
      passwordExpiryDate: ymdOffset(-20),
      dematExpiryDate: ymdOffset(-3),
      meroshareExpiryDate: meroOk,
    };
  }
  return {
    passwordExpiryDate: passwordOk,
    dematExpiryDate: dematOk,
    meroshareExpiryDate: meroOk,
  };
}

function buildSeed(person: PersonSeed, index: number): MockAccountSeed {
  const demat = `130${person.dpId}${person.username}`;
  return {
    meta: {
      id: `${MOCK_ID_PREFIX}${person.slug}`,
      name: person.name,
      dpId: person.dpId,
      dpCode: person.dpId,
      dpName: person.dpName,
      username: person.username,
      bankName: person.bankName,
      accountNumber: person.accountNumber,
      verified: true,
      demat,
      boidHint: person.username.slice(-4),
    },
    secrets: {
      password: 'mock-pass',
      crn: `CRN${1000 + index + 1}`,
      pin: String(1000 + ((index * 111) % 9000)).padStart(4, '0'),
    },
    holdings: buildHoldings(person),
    expiry: expiryFor(person.expiryKind ?? 'none'),
  };
}

function buildExpandedPeople(targetCount: number): PersonSeed[] {
  return Array.from({ length: targetCount }, (_, index) => {
    const base = PEOPLE[index % PEOPLE.length]!;
    const copy = Math.floor(index / PEOPLE.length);
    if (copy === 0) return base;

    const suffix = `${copy + 1}`.padStart(2, '0');
    const baseUser = Number(base.username) || 0;
    const username = String(10_000_000 + ((baseUser + copy * 137 + index) % 89_999_999)).padStart(8, '0');
    const accountSuffix = `${(copy * PEOPLE.length + index + 1) % 10000}`.padStart(4, '0');

    return {
      ...base,
      slug: `${base.slug}-${suffix}`,
      name: `${base.name} ${suffix}`,
      username,
      accountNumber: `${base.accountNumber.slice(0, -4)}${accountSuffix}`,
    };
  });
}

/**
 * 30 realistic sample accounts for Expo Go / offline demos.
 * Holdings include a mix of gains and losses vs previous close & WACC.
 */
export const MOCK_ACCOUNT_SEEDS: MockAccountSeed[] = buildExpandedPeople(30).map(
  buildSeed,
);

export function mockHoldingsForAccount(
  accountId: string,
): ImportedHolding[] | null {
  const seed = MOCK_ACCOUNT_SEEDS.find((s) => s.meta.id === accountId);
  return seed ? seed.holdings.map((h) => ({ ...h })) : null;
}

export function mockExpiryForAccount(accountId: string): MockAccountSeed['expiry'] | null {
  const seed = MOCK_ACCOUNT_SEEDS.find((s) => s.meta.id === accountId);
  return seed?.expiry ?? null;
}
