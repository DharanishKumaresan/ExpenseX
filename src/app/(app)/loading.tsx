import { Skeleton } from '@/components/ui/primitives';

/**
 * Route-level loading state.
 *
 * Shaped like the dashboard it replaces — a label, an oversized figure, a
 * stat row and a chart well — so the page does not visibly jump when the real
 * content arrives.
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-10" role="status" aria-live="polite">
      <span className="sr-only">Loading your finances…</span>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-14 w-72 sm:h-20 sm:w-96" />
      </div>

      <div className="grid grid-cols-2 gap-6 border-y border-line py-6 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-2.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-7 w-28" />
          </div>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="flex flex-col items-center gap-6 py-6">
            <Skeleton className="size-[min(20rem,70vw)] rounded-full" />
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-5">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex items-center justify-between gap-4 py-2.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
