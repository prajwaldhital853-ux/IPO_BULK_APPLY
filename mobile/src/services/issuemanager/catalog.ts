/**
 * SEBON-licensed merchant bankers / issue managers in Nepal.
 * `providerId` set when bulk result API is wired in this app.
 */
export type IssueManagerCatalogEntry = {
  name: string;
  /** Short display name */
  shortName: string;
  /** Linked live provider id when check API is available */
  providerId?: string;
  website?: string;
  resultUrl?: string;
};

export const NEPAL_ISSUE_MANAGERS: IssueManagerCatalogEntry[] = [
  {
    name: 'Aakash Capital Limited',
    shortName: 'Aakash Capital',
    website: 'https://www.aakashcapital.com',
  },
  {
    name: 'Arks Capital Advisors Limited',
    shortName: 'Arks Capital',
  },
  {
    name: 'Asian Capital Limited',
    shortName: 'Asian Capital',
  },
  {
    name: 'CBIL Capital Limited',
    shortName: 'CBIL Capital',
    website: 'https://cbilcapital.com',
  },
  {
    name: 'Century Capital Market Limited',
    shortName: 'Century Capital',
  },
  {
    name: 'Citizen Investment Trust',
    shortName: 'CIT',
    website: 'https://www.nlk.org.np',
  },
  {
    name: 'Citizens Capital Limited',
    shortName: 'Citizens Capital',
  },
  {
    name: 'Civil Capital Market Limited',
    shortName: 'Civil Capital',
    website: 'https://www.civilcapitalmarket.com',
  },
  {
    name: 'Elite Merchant Capital Limited',
    shortName: 'Elite Merchant',
  },
  {
    name: 'Garima Capital Limited',
    shortName: 'Garima Capital',
  },
  {
    name: 'Global IME Capital Limited',
    shortName: 'Global IME Capital',
    providerId: 'global_ime',
    website: 'https://www.globalimecapital.com',
    resultUrl:
      'https://www.globalimecapital.com/ipo-fpo-share-allotment-check',
  },
  {
    name: 'Himalaya Securities Banker Ltd.',
    shortName: 'Himalaya Securities',
  },
  {
    name: 'Himalayan Capital Limited',
    shortName: 'Himalayan Capital',
    providerId: 'himalayan',
    website: 'https://www.himalayancapital.com',
    resultUrl: 'https://flowvity.himalayancapital.com',
  },
  {
    name: 'Janata Capital Limited',
    shortName: 'Janata Capital',
  },
  {
    name: 'Kumari Capital Limited',
    shortName: 'Kumari Capital',
    providerId: 'kumari',
    website: 'https://www.kumaricapital.com',
    resultUrl: 'https://kumaricapital.com/share-details',
  },
  {
    name: 'Laxmi Capital Market Limited',
    shortName: 'Laxmi Capital',
  },
  {
    name: 'Mega Capital Markets Limited',
    shortName: 'Mega Capital',
  },
  {
    name: 'Nabil Investment Banking Limited',
    shortName: 'Nabil Invest',
    providerId: 'nabil',
    website: 'https://www.nabilinvest.com.np',
    resultUrl: 'https://result.nabilinvest.com.np/search/ipo-share',
  },
  {
    name: 'Nepal Bangladesh Capital Limited',
    shortName: 'NB Capital',
  },
  {
    name: 'Nepal SBI Merchant Banking Limited',
    shortName: 'Nepal SBI MB',
  },
  {
    name: 'NIC Asia Capital Limited',
    shortName: 'NIC Asia Capital',
    providerId: 'nic_asia',
    website: 'https://www.nicasiacapital.com',
    resultUrl: 'https://www.nicasiacapital.com/ipo-result',
  },
  {
    name: 'NIMB Ace Capital Limited',
    shortName: 'NIMB Ace Capital',
    providerId: 'nimb_ace',
    website: 'https://www.nimbacecapital.com',
    resultUrl: 'https://result.nimbacecapital.com',
  },
  {
    name: 'NMB Capital Limited',
    shortName: 'NMB Capital',
    providerId: 'nmb',
    website: 'https://www.nmbcl.com.np',
    resultUrl: 'https://www.nmbcl.com.np/shareallotment',
  },
  {
    name: 'NSM Merchant Banking & Investment Limited',
    shortName: 'NSM Merchant',
    website: 'https://www.nsm.com.np',
  },
  {
    name: 'Prabhu Capital Limited',
    shortName: 'Prabhu Capital',
    providerId: 'prabhu',
    website: 'https://www.prabhucapital.com',
    resultUrl: 'https://www.prabhucapital.com/ipo-allotment',
  },
  {
    name: 'Provident Merchant Banking Limited',
    shortName: 'Provident MB',
  },
  {
    name: 'RBB Merchant Banking Limited',
    shortName: 'RBB Merchant',
    providerId: 'rbb',
    website: 'https://www.rbbmbl.com.np',
    resultUrl: 'https://www.rbbmbl.com.np/result/allotment-result-check',
  },
  {
    name: 'Reliable Investment & Merchant Capital Limited',
    shortName: 'Reliable Capital',
  },
  {
    name: 'Sampanna Capital and Advisory Nepal Ltd.',
    shortName: 'Sampanna Capital',
  },
  {
    name: 'Sanima Capital Limited',
    shortName: 'Sanima Capital',
    providerId: 'sanima',
    website: 'https://www.sanima.capital',
    resultUrl: 'https://www.sanima.capital/ipo-results',
  },
  {
    name: 'Siddhartha Capital Limited',
    shortName: 'Siddhartha Capital',
    providerId: 'siddhartha',
    website: 'https://www.siddharthacapital.com',
    resultUrl:
      'https://www.siddharthacapital.com/check-share-allotment-ipo-fpo/',
  },
];

export function catalogWithLiveCheck(): IssueManagerCatalogEntry[] {
  return NEPAL_ISSUE_MANAGERS.filter((e) => !!e.providerId);
}

export function catalogPending(): IssueManagerCatalogEntry[] {
  return NEPAL_ISSUE_MANAGERS.filter((e) => !e.providerId);
}

/** Live managers first, then Soon — easier to find wired sources. */
export function catalogSortedForDisplay(): IssueManagerCatalogEntry[] {
  return [...NEPAL_ISSUE_MANAGERS].sort((a, b) => {
    const al = a.providerId ? 0 : 1;
    const bl = b.providerId ? 0 : 1;
    if (al !== bl) return al - bl;
    return a.name.localeCompare(b.name);
  });
}
