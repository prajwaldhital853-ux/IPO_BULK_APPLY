import { createFrontApiProvider } from './frontapi';

export const nmbProvider = createFrontApiProvider({
  id: 'nmb',
  label: 'NMB Capital',
  siteBase: 'https://www.nmbcl.com.np',
  refererPath: '/shareallotment',
});
