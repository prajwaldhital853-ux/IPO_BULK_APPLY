import { createFlowvityProvider } from './flowvity';

export const prabhuProvider = createFlowvityProvider({
  id: 'prabhu',
  label: 'Prabhu Capital',
  apiBase: 'https://www.prabhucapital.com',
  origin: 'https://www.prabhucapital.com',
  referer: 'https://www.prabhucapital.com/ipo-allotment',
});
