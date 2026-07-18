import { createFlowvityProvider } from './flowvity';

export const nimbAceProvider = createFlowvityProvider({
  id: 'nimb_ace',
  label: 'NIMB Ace Capital',
  apiBase: 'https://flowvity.nimbacecapital.com',
  origin: 'https://result.nimbacecapital.com',
  referer: 'https://result.nimbacecapital.com/',
});
