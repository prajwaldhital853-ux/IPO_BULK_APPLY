import { createFlowvityProvider } from './flowvity';

export const himalayanProvider = createFlowvityProvider({
  id: 'himalayan',
  label: 'Himalayan Capital',
  apiBase: 'https://flowvity.himalayancapital.com',
  origin: 'https://www.himalayancapital.com',
  referer: 'https://www.himalayancapital.com/',
});
