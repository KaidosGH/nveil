import { getDict } from '@/lib/i18n';
import { getServerLocale } from '@/lib/i18n-server';

/**
 * Root loading placeholder — shown for client navigations to "/" (the nveil
 * logo, the 404 page's home link). Shaped like the landing page itself:
 * hero heading, subtitle lines, CTA block, and the three step cards. No
 * other route needs one — /create has its own card skeleton, and every
 * other destination (secret/manage links, legal pages, abuse queue) is
 * reached via new tabs or direct URL loads, which never render this file.
 * The skeleton blocks pulse (opacity only), which conveys progress and stays
 * on under prefers-reduced-motion.
 */
export default async function Loading() {
  const label = getDict(await getServerLocale()).common.loading;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-12 text-center animate-pulse">
      <span role="status" className="sr-only">
        {label}
      </span>
      <div className="h-10 w-3/4 rounded bg-muted sm:h-12" />
      <div className="mt-4 h-4 w-full rounded bg-muted" />
      <div className="mt-2 h-4 w-2/3 rounded bg-muted" />
      <div className="mt-8 h-12 w-44 rounded-md bg-muted" />
      <div className="mt-12 grid w-full gap-6 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-lg border bg-card p-4">
            <div className="h-3 w-6 rounded bg-muted" />
            <div className="mt-2 h-4 w-2/3 rounded bg-muted" />
            <div className="mt-3 h-3 w-full rounded bg-muted" />
          </div>
        ))}
      </div>
    </main>
  );
}
