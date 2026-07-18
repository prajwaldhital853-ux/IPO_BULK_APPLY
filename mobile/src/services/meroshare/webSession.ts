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

/** Runs before MeroShare SPA boot so Angular sees an authenticated session. */
export function buildMeroshareSessionBootstrap(token: string): string {
  const encoded = JSON.stringify(token);
  return `(function(){
    try {
      sessionStorage.removeItem('Authorization');
      sessionStorage.setItem('Authorization', ${encoded});
      if (!location.hash || location.hash === '#/' || location.hash === '#/login') {
        location.replace('/#/dashboard');
      }
    } catch (e) {}
  })(); true;`;
}

/** After SPA loads — nudge off login if token is present but route stuck. */
export function buildMerosharePostLoadScript(token: string): string {
  const encoded = JSON.stringify(token);
  return `(function(){
    try {
      var t = sessionStorage.getItem('Authorization') || ${encoded};
      if (t) sessionStorage.setItem('Authorization', t);
      var h = location.hash || '';
      if (!h || h === '#/' || h === '#/login') location.replace('/#/dashboard');
    } catch (e) {}
  })(); true;`;
}
