export type LegalSection = { heading: string; body: string };

export type LegalDoc = {
  intro: string;
  sections: LegalSection[];
};

export type AboutPage = {
  tagline: string;
  whoWeAre: string;
  offerings: string[];
};

export type LegalPages = {
  about: AboutPage;
  terms: LegalDoc;
  privacy: LegalDoc;
};

export const DEFAULT_LEGAL_PAGES: LegalPages = {
  about: {
    tagline: 'NEPSE GHAR · Capital market tools',
    whoWeAre:
      'Kalash Financial Solution Pvt. Ltd. builds NEPSE GHAR to help Nepali investors manage MeroShare accounts, apply IPO in bulk, track live market data, and access research tools — all from one mobile app.',
    offerings: [
      'Bulk & single MeroShare IPO apply',
      'Account expiry, portfolio & result checks',
      'Live NEPSE market, watchlist & share news',
      'Premium analytics for serious investors',
    ],
  },
  terms: {
    intro: 'Please read these terms carefully before using NEPSE GHAR.',
    sections: [
      {
        heading: '1. Acceptance of Terms',
        body: 'By downloading, installing or using NEPSE GHAR you agree to these Terms & Conditions. If you do not agree, please stop using the app.',
      },
      {
        heading: '2. What the app does',
        body: 'NEPSE GHAR is a tool that helps you manage your MeroShare accounts, apply for IPO/FPO/rights in bulk, check application status and results, and view NEPSE market data. We are an independent tool and are not affiliated with, endorsed by, or operated by CDSC, MeroShare, or NEPSE.',
      },
      {
        heading: '3. Your accounts & responsibility',
        body: 'You are responsible for the MeroShare credentials (DP, username, password, CRN, transaction PIN) you add to the app and for every action performed using them, including IPO applications. Always verify company, quantity and amount before you confirm any application.',
      },
      {
        heading: '4. No financial advice',
        body: 'Market data, analytics and premium insights are provided for information only and are not investment advice. You are solely responsible for your investment decisions. Data may be delayed or inaccurate.',
      },
      {
        heading: '5. Subscriptions',
        body: 'Some features require a paid premium subscription. Prices and account limits are shown in the app. Premium is activated after your payment is verified. Fees are non-refundable except where required by law.',
      },
      {
        heading: '6. Acceptable use',
        body: 'You agree not to misuse the app, attempt to access other users’ data, reverse-engineer the app, or use it for any unlawful purpose.',
      },
      {
        heading: '7. Availability & liability',
        body: 'The app depends on third-party services (MeroShare/CDSC, NEPSE and our servers) that may be unavailable at times. We are not liable for missed IPO applications, allotment outcomes, losses, or downtime arising from such services or from your use of the app.',
      },
      {
        heading: '8. Changes',
        body: 'We may update these terms and app features from time to time. Continued use after changes means you accept the updated terms.',
      },
    ],
  },
  privacy: {
    intro:
      'This Privacy Policy explains how NEPSE GHAR handles your information.',
    sections: [
      {
        heading: '1. Information we handle',
        body: 'To provide its features the app handles your MeroShare account details (DP, username, password, CRN, transaction PIN), your profile info (name, email) when you sign in, and app usage needed to operate features.',
      },
      {
        heading: '2. Where your credentials are stored',
        body: 'Your MeroShare passwords, CRN and transaction PIN are stored encrypted on your own device using the secure storage of your phone. They are used only to log in to MeroShare on your behalf to perform the actions you request.',
      },
      {
        heading: '3. How we use data',
        body: 'We use your data only to run the features you use — logging into MeroShare, applying for IPOs, checking status/results, showing market data, and managing your subscription. We do not sell your data.',
      },
      {
        heading: '4. Account & payment',
        body: 'When you sign in with Google we receive your basic profile (name, email, avatar) to create your account. Premium payment screenshots you share for verification are used only to activate your subscription.',
      },
      {
        heading: '5. Third-party services',
        body: 'The app communicates with MeroShare/CDSC and NEPSE data sources to fetch and submit information you request, and with our servers for authentication and subscription. Their handling of data is governed by their own policies.',
      },
      {
        heading: '6. Data retention & deletion',
        body: 'Account credentials remain on your device until you remove the account or uninstall the app. You can delete your profile at any time from Profile → Delete account, which removes your server profile and local data.',
      },
      {
        heading: '7. Security',
        body: 'We use device secure storage and encrypted connections. However, no method is 100% secure. Keep your device protected with a screen lock and the in-app PIN.',
      },
      {
        heading: '8. Contact',
        body: 'For any privacy question, contact us from Profile → Connect With Us (email or WhatsApp).',
      },
    ],
  },
};

export function mapLegalPages(raw: unknown): LegalPages {
  const base = DEFAULT_LEGAL_PAGES;
  if (!raw || typeof raw !== 'object') {
    return {
      about: { ...base.about, offerings: [...base.about.offerings] },
      terms: {
        intro: base.terms.intro,
        sections: base.terms.sections.map((s) => ({ ...s })),
      },
      privacy: {
        intro: base.privacy.intro,
        sections: base.privacy.sections.map((s) => ({ ...s })),
      },
    };
  }
  const row = raw as Record<string, unknown>;
  const aboutRaw = (row.about ?? {}) as Record<string, unknown>;
  const termsRaw = (row.terms ?? {}) as Record<string, unknown>;
  const privacyRaw = (row.privacy ?? {}) as Record<string, unknown>;

  const mapDoc = (
    doc: Record<string, unknown>,
    fallback: LegalDoc,
  ): LegalDoc => {
    const intro = String(doc.intro ?? fallback.intro).trim() || fallback.intro;
    const sectionsRaw = Array.isArray(doc.sections) ? doc.sections : [];
    const sections: LegalSection[] = [];
    for (const entry of sectionsRaw) {
      if (!entry || typeof entry !== 'object') continue;
      const s = entry as Record<string, unknown>;
      const heading = String(s.heading ?? '').trim();
      const body = String(s.body ?? '').trim();
      if (!heading && !body) continue;
      sections.push({ heading: heading || 'Section', body });
    }
    return {
      intro,
      sections: sections.length
        ? sections
        : fallback.sections.map((s) => ({ ...s })),
    };
  };

  const offeringsRaw = aboutRaw.offerings;
  const offerings: string[] = [];
  if (Array.isArray(offeringsRaw)) {
    for (const item of offeringsRaw) {
      const s = String(item).trim();
      if (s) offerings.push(s);
    }
  }

  return {
    about: {
      tagline:
        String(aboutRaw.tagline ?? base.about.tagline).trim() ||
        base.about.tagline,
      whoWeAre:
        String(aboutRaw.whoWeAre ?? aboutRaw.who_we_are ?? base.about.whoWeAre).trim() ||
        base.about.whoWeAre,
      offerings: offerings.length ? offerings : [...base.about.offerings],
    },
    terms: mapDoc(termsRaw, base.terms),
    privacy: mapDoc(privacyRaw, base.privacy),
  };
}
