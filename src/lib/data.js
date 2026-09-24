import data from '../data/portfolio.json';

export const pieces = data.pieces.map((p) => ({ ...p, dateObj: new Date(p.date + 'T12:00:00') }));
export const { outlets, lists, places, projects, copy } = data;

export const byId = Object.fromEntries(pieces.map((p) => [p.id, p]));
export const outletById = Object.fromEntries(outlets.map((o) => [o.id, o]));

const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const formatDate = (p) =>
  p.datePrecision === 'year' ? p.date.slice(0, 4) : fmt.format(new Date(p.date + 'T00:00:00Z'));

export const stats = [
  ['Pieces', pieces.length],
  ['Outlets', outlets.length],
  ['Years', `${pieces[0].date.slice(0, 4)}–${pieces[pieces.length - 1].date.slice(0, 4)}`],
  ['Places', Object.keys(places).length],
  ['Themes', lists.themes.length],
];

/** Prefix a site-relative path (e.g. images/x.jpg) with the deploy base (/writing-portfolio/). */
export const asset = (path) => import.meta.env.BASE_URL.replace(/\/?$/, '/') + path.replace(/^\//, '');
