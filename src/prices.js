/**
 * taal's prices, the same as the pricing section on the website (public/index.html, ITEMS).
 * All in pounds, including VAT. The founding offer takes 30% off setup, item by item.
 */
export const ITEMS = {
  base: { label: 'Booking system', once: 1900, p12: { start: 400, monthly: 150 }, p24: { start: 300, monthly: 90 } },
  apps: { label: 'Your own apps', once: 1000, p12: { start: 200, monthly: 85 }, p24: { start: 100, monthly: 50 } },
  site: { label: 'Website', once: 800, p12: { start: 200, monthly: 65 }, p24: { start: 200, monthly: 35 } },
};
export const CARE = { base: 30, apps: 40 };
export const FOUNDING_OFF = 0.3;
export const PLANS = { once: 'Once, in two parts', '12': 'Over 12 months', '24': 'Over 24 months' };

/** What a studio pays, from its choices: { apps, site, plan: 'once' | '12' | '24', founding }. */
export function quote({ apps = false, site = false, plan = 'once', founding = false } = {}) {
  const keys = ['base', ...(apps ? ['apps'] : []), ...(site ? ['site'] : [])];
  const cut = (v) => Math.round(v * (founding ? 1 - FOUNDING_OFF : 1));
  const months = plan === '12' ? 12 : plan === '24' ? 24 : 0;
  const lines = keys.map((k) => {
    const it = ITEMS[k];
    const once = cut(it.once);
    const p = months ? it[`p${months}`] : null;
    return { key: k, label: it.label, once, start: p ? cut(p.start) : 0, monthly: p ? cut(p.monthly) : 0 };
  });
  const sum = (f) => lines.reduce((t, l) => t + l[f], 0);
  const once = sum('once'), start = sum('start'), monthly = sum('monthly');
  const total = months ? start + monthly * months : once;
  // Paying once: half when they sign, the rest at go-live (the odd pound goes on the first).
  const first = months ? start : Math.ceil(once / 2);
  const last = months ? 0 : once - first;
  return { keys, lines, plan: months ? String(months) : 'once', months, once, start, monthly, total, first, last, care: apps ? CARE.apps : CARE.base, founding: !!founding };
}

export const gbp = (n) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

/** One line in plain words, e.g. "£800 when you sign, then £300 a month for 12 months (£4,400 in total)". */
export function payLine(q) {
  if (q.months) return `${gbp(q.start)} when you sign, then ${gbp(q.monthly)} a month for ${q.months} months from go-live (${gbp(q.total)} in total)`;
  return `${gbp(q.total)}: ${gbp(q.first)} when you sign and ${gbp(q.last)} when you go live`;
}
