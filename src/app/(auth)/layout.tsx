import Link from 'next/link';
import { Wordmark } from '@/components/brand';

/**
 * Split entry screen: an editorial brand panel of dark olive with the hatched
 * curve, and the form itself on the sage ground. On small screens the brand
 * panel collapses to a compact band so the form stays above the fold.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      <aside className="relative flex shrink-0 flex-col justify-between overflow-hidden bg-forest px-6 py-8 lg:w-[46%] lg:max-w-[640px] lg:px-12 lg:py-14">

        <div className="relative">
          <Link href="/" className="inline-flex">
            <Wordmark size="md" inverse className="lg:hidden" />
            <Wordmark size="lg" inverse className="hidden lg:inline-flex" />
          </Link>
        </div>

        <div className="relative mt-8 hidden max-w-[30ch] lg:block">
          <p className="text-[2rem] leading-[1.08] font-semibold tracking-[-0.03em] text-on-forest">
            Your money, clearly.
            <span className="block text-on-forest-muted">Every day.</span>
          </p>
          <p className="mt-5 max-w-[38ch] text-[0.9375rem] leading-relaxed text-on-forest-muted">
            Track your own spending privately, and open one shared space for the budget you
            keep with someone else.
          </p>
        </div>

        <dl className="relative mt-6 hidden grid-cols-3 gap-4 border-t border-line-on-forest pt-5 lg:grid">
          {[
            { label: 'Private', value: 'Yours' },
            { label: 'Shared', value: 'Two' },
            { label: 'Currency', value: 'INR' },
          ].map((item) => (
            <div key={item.label}>
              <dt className="ex-label text-on-forest-muted">{item.label}</dt>
              <dd className="ex-numeral mt-1.5 text-[1.125rem] text-on-forest">{item.value}</dd>
            </div>
          ))}
        </dl>
      </aside>

      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:py-14">
        <div className="w-full max-w-[26rem]">{children}</div>
      </main>
    </div>
  );
}
