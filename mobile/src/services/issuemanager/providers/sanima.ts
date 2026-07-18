import { createFrontApiProvider } from './frontapi';

export const sanimaProvider = createFrontApiProvider({
  id: 'sanima',
  label: 'Sanima Capital',
  siteBase: 'https://www.sanima.capital',
  refererPath: '/ipo-results',
});
