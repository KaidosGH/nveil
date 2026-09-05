import Link from 'next/link';
import { getServerLocale } from '@/lib/i18n-server';
import { getDict } from '@/lib/i18n/index';
import { buttonVariants } from '@/components/ui/button';

export default async function LandingPage() {
  const locale = await getServerLocale();
  const t = getDict(locale).landing;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">{t.title}</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-foreground">{t.subtitle}</p>
      <Link href="/create" className={buttonVariants({ size: 'lg' }) + ' mt-8'}>
        {t.cta}
      </Link>

      <ol className="mt-12 grid w-full gap-6 text-left sm:grid-cols-3">
        {t.steps.map((step, i) => (
          <li key={step.title} className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">{i + 1}</div>
            <div className="mt-1 font-semibold">{step.title}</div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>

      <p className="mt-10 max-w-lg text-sm leading-relaxed text-foreground">{t.note}</p>
    </main>
  );
}
