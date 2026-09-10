import Link from 'next/link';
import { Wordmark } from '@/components/brand';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-12">
      <div className="flex w-full max-w-lg flex-col gap-7">
        <Link href="/" className="inline-flex">
          <Wordmark size="md" />
        </Link>

        <div className="flex flex-col gap-3">
          <p className="ex-numeral text-[4rem] leading-none text-ink-faint">404</p>
          <h1 className="text-[1.75rem] leading-[1.05] font-bold tracking-[-0.03em] uppercase text-ink">
            That page does not exist.
          </h1>
          <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink-3">
            The link may be out of date, or the thing it pointed at has been deleted.
          </p>
        </div>

        <Link
          href="/overview"
          className="inline-flex h-11 w-fit items-center rounded-[8px] bg-forest px-5 font-mono text-[0.75rem] tracking-[0.14em] uppercase text-on-forest transition-colors hover:bg-forest-2"
        >
          Back to overview
        </Link>
      </div>
    </main>
  );
}
