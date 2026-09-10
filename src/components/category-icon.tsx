import { cn } from '@/lib/utils';

/**
 * Category glyphs.
 *
 * Deliberately spare: single-weight line drawings on a solid tile, in the
 * restrained spirit of the reference art direction. Every glyph shares one
 * stroke width so a list of them reads as a column of equal marks rather than
 * a sticker sheet.
 */

const STROKE = 1.4;

function Glyph({ slug }: { slug: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };

  switch (slug) {
    case 'food':
      return (
        <svg {...common}>
          <path d="M5.5 3v6.5a2 2 0 0 0 4 0V3M7.5 9.5V17" />
          <path d="M14 3c-1.4 1-2 2.6-2 4.4 0 1.4.7 2.3 2 2.6V17" />
        </svg>
      );
    case 'groceries':
      return (
        <svg {...common}>
          <path d="M3 4h2l2 9h8l2-6H6" />
          <circle cx="8" cy="16" r="1.2" />
          <circle cx="14.5" cy="16" r="1.2" />
        </svg>
      );
    case 'shopping':
      return (
        <svg {...common}>
          <path d="M4.5 6.5h11l-1 10h-9l-1-10Z" />
          <path d="M7.5 6.5V5a2.5 2.5 0 0 1 5 0v1.5" />
        </svg>
      );
    case 'transport':
      return (
        <svg {...common}>
          <path d="M3.5 12.5V9l1.8-4h9.4l1.8 4v3.5" />
          <path d="M3.5 12.5h13M5 12.5v2M15 12.5v2" />
          <circle cx="6.5" cy="10" r="0.9" />
          <circle cx="13.5" cy="10" r="0.9" />
        </svg>
      );
    case 'rent':
    case 'housing':
      return (
        <svg {...common}>
          <path d="M3.5 9L10 3.8 16.5 9v7.2h-13V9Z" />
          <path d="M8 16.2v-4h4v4" />
        </svg>
      );
    case 'bills':
      return (
        <svg {...common}>
          <path d="M5 3h10v14l-2.5-1.5L10 17l-2.5-1.5L5 17V3Z" />
          <path d="M8 7.5h4M8 10.5h4" />
        </svg>
      );
    case 'education':
      return (
        <svg {...common}>
          <path d="M10 4l7 3.2-7 3.2-7-3.2L10 4Z" />
          <path d="M5.5 8.8V13c0 1.2 2 2.2 4.5 2.2s4.5-1 4.5-2.2V8.8" />
        </svg>
      );
    case 'health':
      return (
        <svg {...common}>
          <path d="M10 16.2S3.8 12.4 3.8 8.2A3.4 3.4 0 0 1 10 6.3a3.4 3.4 0 0 1 6.2 1.9c0 4.2-6.2 8-6.2 8Z" />
        </svg>
      );
    case 'entertainment':
      return (
        <svg {...common}>
          <rect x="3.2" y="5" width="13.6" height="10" rx="1.6" />
          <path d="M8.4 8.4l4.2 2.1-4.2 2.1V8.4Z" />
        </svg>
      );
    case 'subscriptions':
      return (
        <svg {...common}>
          <path d="M16.4 8.6A6.5 6.5 0 0 0 4.6 6.8M3.6 11.4a6.5 6.5 0 0 0 11.8 1.8" />
          <path d="M16.4 4.6v4h-4M3.6 15.4v-4h4" />
        </svg>
      );
    case 'travel':
      return (
        <svg {...common}>
          <path d="M3 11.2l14-5.4-2.6 5.2 2.6 5.2-14-5Z" />
        </svg>
      );
    case 'investments':
      return (
        <svg {...common}>
          <path d="M3.5 14.5l4-4.2 3 2.6 6-6.4" />
          <path d="M13 6.5h3.5V10" />
        </svg>
      );
    case 'salary':
    case 'freelance':
      return (
        <svg {...common}>
          <rect x="3.2" y="5.5" width="13.6" height="9" rx="1.6" />
          <circle cx="10" cy="10" r="2.1" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="6.4" />
          <path d="M10 6.8v3.4l2.2 1.4" />
        </svg>
      );
  }
}

export function CategoryIcon({
  slug,
  size = 'md',
  tone = 'forest',
  className,
}: {
  slug: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'forest' | 'surface' | 'accent' | 'coral' | 'outline';
  className?: string;
}) {
  const sizes = { sm: 'size-8', md: 'size-10', lg: 'size-12' };
  const tones = {
    forest: 'bg-forest text-on-forest',
    surface: 'bg-surface-3 text-ink-2',
    accent: 'bg-accent text-on-accent',
    coral: 'bg-coral text-on-coral',
    outline: 'border border-line-strong text-ink-2',
  };

  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-[8px]',
        sizes[size],
        tones[tone],
        className,
      )}
    >
      <Glyph slug={slug ?? 'other'} />
    </span>
  );
}
