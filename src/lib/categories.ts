import type { CategoryKind } from '@prisma/client';

/**
 * System category presets, seeded once and shared by every user
 * (Category.userId = NULL). Users may add their own on top.
 *
 * `color` is a token *name*, resolved through CATEGORY_SWATCH — components
 * never receive a raw hex from the database.
 */
export interface CategoryPreset {
  slug: string;
  name: string;
  icon: string;
  kind: CategoryKind;
  color: CategorySwatch;
  sortOrder: number;
}

export type CategorySwatch =
  | 'ink'
  | 'forest'
  | 'moss'
  | 'fern'
  | 'slate'
  | 'sage'
  | 'stone'
  | 'clay'
  | 'accent'
  | 'coral';

/**
 * Chart/legend colours. Deliberately a restrained, tonal set: the radial
 * visualisation reads as one material with density differences, not a
 * rainbow. Accent + coral are reserved so they keep their meaning.
 */
export const CATEGORY_SWATCH: Record<CategorySwatch, string> = {
  // An eight-step tonal ramp through the olive family, plus the two accents.
  // The steps are spaced far enough apart to stay separable in the radial
  // chart while still reading as one material rather than a rainbow.
  ink: '#262626',
  forest: '#404040',
  moss: '#555555',
  fern: '#707070',
  slate: '#858585',
  sage: '#999999',
  stone: '#adadad',
  clay: '#bfbfbf',
  accent: '#d2d2d2',
  coral: '#e5e5e5',
};

export const CATEGORY_PRESETS: readonly CategoryPreset[] = [
  { slug: 'food', name: 'Food', icon: 'food', kind: 'EXPENSE', color: 'forest', sortOrder: 10 },
  { slug: 'shopping', name: 'Shopping', icon: 'shopping', kind: 'EXPENSE', color: 'clay', sortOrder: 20 },
  { slug: 'transport', name: 'Transport', icon: 'transport', kind: 'EXPENSE', color: 'sage', sortOrder: 30 },
  { slug: 'rent', name: 'Rent', icon: 'rent', kind: 'EXPENSE', color: 'ink', sortOrder: 40 },
  { slug: 'bills', name: 'Bills', icon: 'bills', kind: 'EXPENSE', color: 'fern', sortOrder: 50 },
  { slug: 'education', name: 'Education', icon: 'education', kind: 'EXPENSE', color: 'slate', sortOrder: 60 },
  { slug: 'health', name: 'Health', icon: 'health', kind: 'EXPENSE', color: 'coral', sortOrder: 70 },
  { slug: 'entertainment', name: 'Entertainment', icon: 'entertainment', kind: 'EXPENSE', color: 'accent', sortOrder: 80 },
  { slug: 'subscriptions', name: 'Subscriptions', icon: 'subscriptions', kind: 'EXPENSE', color: 'stone', sortOrder: 90 },
  { slug: 'travel', name: 'Travel', icon: 'travel', kind: 'EXPENSE', color: 'slate', sortOrder: 100 },
  { slug: 'housing', name: 'Housing', icon: 'housing', kind: 'EXPENSE', color: 'ink', sortOrder: 110 },
  { slug: 'groceries', name: 'Groceries', icon: 'groceries', kind: 'EXPENSE', color: 'moss', sortOrder: 120 },
  { slug: 'investments', name: 'Investments', icon: 'investments', kind: 'BOTH', color: 'stone', sortOrder: 130 },
  { slug: 'salary', name: 'Salary', icon: 'salary', kind: 'INCOME', color: 'forest', sortOrder: 140 },
  { slug: 'freelance', name: 'Freelance', icon: 'freelance', kind: 'INCOME', color: 'moss', sortOrder: 150 },
  { slug: 'other', name: 'Other', icon: 'other', kind: 'BOTH', color: 'stone', sortOrder: 999 },
];

export function swatchFor(color: string | null | undefined): string {
  return CATEGORY_SWATCH[(color ?? 'stone') as CategorySwatch] ?? CATEGORY_SWATCH.stone;
}

/**
 * Deterministic swatch for anything without an assigned colour (custom
 * categories, "Uncategorised"), so a chart keeps the same colours between
 * renders and between sessions.
 */
export function swatchForKey(key: string): string {
  const keys = Object.keys(CATEGORY_SWATCH) as CategorySwatch[];
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  const swatch = keys[Math.abs(hash) % keys.length] ?? 'stone';
  return CATEGORY_SWATCH[swatch];
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
