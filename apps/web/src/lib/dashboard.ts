/**
 * L'adresse du dashboard, en un seul endroit.
 *
 * `VITE_DASHBOARD_URL` est une surcharge de build ; par defaut c'est le
 * dashboard de production. La constante vivait dans `ContributeStrip`,
 * ou elle etait juste — et `IncompletePanel`, qui a exactement le meme
 * besoin (« va editer cette entite »), pointait a cote : il envoyait
 * sur `/e/<type>/<slug>`, une route du wiki qui redirige en 301 vers la
 * page d'ou l'on vient. Le bouton « Complete this page » rechargeait
 * donc la meme page. Une seule source, et les deux boutons vont au
 * meme endroit.
 */
const envUrl: unknown = import.meta.env['VITE_DASHBOARD_URL'];

export const DASHBOARD_URL: string = typeof envUrl === 'string' && envUrl !== ''
  ? envUrl.replace(/\/$/, '')
  : 'https://one-piece-wiki-v4-dashboard.vercel.app';

/** Le formulaire d'edition du dashboard pour une entite. */
export function dashboardEntityUrl(type: string, slug: string): string {
  return `${DASHBOARD_URL}/types/${type}/${slug}`;
}
