"""Static HTML for public /privacy and /terms endpoints (Google Play)."""

from __future__ import annotations

PRIVACY_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy · NEPSE GHAR</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.65; color: #142033; }
    h1 { font-size: 1.8rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.15rem; margin-top: 1.6rem; }
    .meta { color: #5b6b7c; font-size: 0.95rem; margin-bottom: 1.5rem; }
    a { color: #1a5fbf; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p class="meta">Last updated: 5 August 2026 · NEPSE GHAR (com.nepse.ghar)</p>
  <p>This Privacy Policy explains how <strong>NEPSE GHAR</strong>, operated by
  <strong>Sumit Saphi</strong> (Kalash Financial Solution), handles your information
  when you use the NEPSE GHAR mobile application and related services.</p>

  <h2>1. Information we handle</h2>
  <p>To provide its features the app may handle your MeroShare account details
  (DP, username, password, CRN, transaction PIN), your profile info (name, email,
  avatar) when you sign in with Google, premium payment verification images you
  choose to submit, and app usage needed to operate features.</p>

  <h2>2. Where your credentials are stored</h2>
  <p>Your MeroShare passwords, CRN and transaction PIN are stored encrypted on your
  own device using the secure storage of your phone. They are used only to log in
  to MeroShare on your behalf to perform the actions you request.</p>

  <h2>3. How we use data</h2>
  <p>We use your data only to run the features you use — logging into MeroShare,
  applying for IPOs, checking status/results, showing market data, and managing
  your subscription. We do not sell your data.</p>

  <h2>4. Account &amp; payment</h2>
  <p>When you sign in with Google we receive your basic profile (name, email, avatar)
  to create your account. Premium payment screenshots you share for verification
  are used only to activate your subscription.</p>

  <h2>5. Third-party services</h2>
  <p>The app communicates with MeroShare/CDSC and NEPSE data sources to fetch and
  submit information you request, and with our servers (including api.nepseghar.com)
  for authentication and subscription. Their handling of data is governed by their
  own policies.</p>

  <h2>6. Data retention &amp; deletion</h2>
  <p>Account credentials remain on your device until you remove the account or
  uninstall the app. You can delete your profile at any time from
  <strong>Profile → Delete account</strong>, which removes your server profile and
  local data. You may also email us to request deletion.</p>

  <h2>7. Security</h2>
  <p>We use device secure storage and encrypted connections. However, no method is
  100% secure. Keep your device protected with a screen lock and the in-app PIN.</p>

  <h2>8. Children's privacy</h2>
  <p>NEPSE GHAR is intended for adults. It is not directed at children under 18.</p>

  <h2>9. Changes</h2>
  <p>We may update this Privacy Policy from time to time. The “Last updated” date
  at the top will change when we do. Continued use of the app after changes means
  you accept the updated policy.</p>

  <h2>10. Contact</h2>
  <p>Email:
  <a href="mailto:kalash.financialsolutions@gmail.com">kalash.financialsolutions@gmail.com</a><br />
  Or from the app: Profile → Connect With Us<br />
  Operator: Sumit Saphi · Siraha, Laxmipur Patari, Ward No. 3, Nepal</p>
</body>
</html>
"""

TERMS_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Terms &amp; Conditions · NEPSE GHAR</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.65; color: #142033; }
    h1 { font-size: 1.8rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.15rem; margin-top: 1.6rem; }
    .meta { color: #5b6b7c; font-size: 0.95rem; margin-bottom: 1.5rem; }
    a { color: #1a5fbf; }
  </style>
</head>
<body>
  <h1>Terms &amp; Conditions</h1>
  <p class="meta">Last updated: 5 August 2026 · NEPSE GHAR</p>
  <p>Please read these terms carefully before using <strong>NEPSE GHAR</strong>,
  operated by <strong>Sumit Saphi</strong> (Kalash Financial Solution).</p>

  <h2>1. Acceptance of Terms</h2>
  <p>By downloading, installing or using NEPSE GHAR you agree to these Terms &amp;
  Conditions. If you do not agree, please stop using the app.</p>

  <h2>2. What the app does</h2>
  <p>NEPSE GHAR is a tool that helps you manage your MeroShare accounts, apply for
  IPO/FPO/rights in bulk, check application status and results, and view NEPSE
  market data. We are an independent tool and are not affiliated with, endorsed by,
  or operated by CDSC, MeroShare, or NEPSE.</p>

  <h2>3. Your accounts &amp; responsibility</h2>
  <p>You are responsible for the MeroShare credentials you add to the app and for
  every action performed using them, including IPO applications. Always verify
  company, quantity and amount before you confirm any application.</p>

  <h2>4. No financial advice</h2>
  <p>Market data, analytics and premium insights are provided for information only
  and are not investment advice. You are solely responsible for your investment
  decisions. Data may be delayed or inaccurate.</p>

  <h2>5. Subscriptions</h2>
  <p>Some features require a paid premium subscription. Prices and account limits
  are shown in the app. Premium is activated after your payment is verified. Fees
  are non-refundable except where required by law.</p>

  <h2>6. Acceptable use</h2>
  <p>You agree not to misuse the app, attempt to access other users’ data,
  reverse-engineer the app, or use it for any unlawful purpose.</p>

  <h2>7. Availability &amp; liability</h2>
  <p>The app depends on third-party services that may be unavailable at times. We
  are not liable for missed IPO applications, allotment outcomes, losses, or
  downtime arising from such services or from your use of the app.</p>

  <h2>8. Changes</h2>
  <p>We may update these terms and app features from time to time. Continued use
  after changes means you accept the updated terms.</p>

  <h2>9. Contact</h2>
  <p><a href="mailto:kalash.financialsolutions@gmail.com">kalash.financialsolutions@gmail.com</a></p>
</body>
</html>
"""
