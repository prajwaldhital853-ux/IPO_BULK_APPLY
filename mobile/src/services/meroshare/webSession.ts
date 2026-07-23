import { MeroshareClient } from './client';
import type { AccountMeta } from '../../types/account';

export type MeroshareWebSession = {
  token: string;
  clientId: number;
  username: string;
};

export async function loginAccountForWeb(
  account: AccountMeta,
  password: string,
): Promise<MeroshareWebSession> {
  const client = new MeroshareClient();
  const session = await client.login({
    clientId: account.dpId,
    username: account.username,
    password,
    dpCode: account.dpCode,
    dpName: account.dpName,
  });
  return {
    token: session.token,
    clientId: session.clientId,
    username: session.username,
  };
}

/** MeroShare nginx serves SPA only from `/` — `/dashboard` returns 404. Use hash route. */
export const MEROSHARE_WEB_HOME = 'https://meroshare.cdsc.com.np/';
export const MEROSHARE_WEB_APP_URL = 'https://meroshare.cdsc.com.np/#/dashboard';
/** My Purchase Source — WACC calculation / purchase page in MeroShare SPA. */
export const MEROSHARE_WEB_PURCHASE_URL =
  'https://meroshare.cdsc.com.np/#/purchase';

/** Runs before MeroShare SPA boot so Angular sees an authenticated session. */
export function buildMeroshareSessionBootstrap(
  token: string,
  targetHash = '/dashboard',
): string {
  const encoded = JSON.stringify(token);
  const normalized = targetHash.startsWith('#')
    ? targetHash
    : `#/${targetHash.replace(/^#?\/?/, '')}`;
  const hashLit = JSON.stringify(normalized);
  return `(function(){
    try {
      sessionStorage.removeItem('Authorization');
      sessionStorage.setItem('Authorization', ${encoded});
      var target = ${hashLit};
      if (!location.hash || location.hash === '#/' || location.hash === '#/login') {
        location.replace('/' + target);
      } else if (location.hash.indexOf(target.replace(/^#/, '')) < 0) {
        location.replace('/' + target);
      }
    } catch (e) {}
  })(); true;`;
}

/** After SPA loads — nudge off login if token is present but route stuck. */
export function buildMerosharePostLoadScript(
  token: string,
  targetHash = '/dashboard',
): string {
  const encoded = JSON.stringify(token);
  const normalized = targetHash.startsWith('#')
    ? targetHash
    : `#/${targetHash.replace(/^#?\/?/, '')}`;
  const hashLit = JSON.stringify(normalized);
  return `(function(){
    try {
      var t = sessionStorage.getItem('Authorization') || ${encoded};
      if (t) sessionStorage.setItem('Authorization', t);
      var h = location.hash || '';
      var target = ${hashLit};
      if (!h || h === '#/' || h === '#/login') location.replace('/' + target);
    } catch (e) {}
  })(); true;`;
}
