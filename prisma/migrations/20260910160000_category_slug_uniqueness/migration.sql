-- ===========================================================================
-- System category uniqueness
--
-- `@@unique([userId, slug])` does NOT constrain the built-in categories,
-- because their userId is NULL and PostgreSQL treats every NULL as distinct in
-- a unique index. Re-running the seed (or two sign-ups racing the first-run
-- category bootstrap) therefore produced duplicate "Food", "Shopping", … rows,
-- which surfaced as repeated entries in every category picker.
--
-- This migration collapses the duplicates onto the oldest row of each slug,
-- repoints everything that referenced a duplicate, and then adds the partial
-- unique index that makes the situation unrepresentable.
-- ===========================================================================

-- 1. Pick the surviving row per slug: the earliest created, then lowest id.
CREATE TEMP TABLE category_survivor AS
SELECT DISTINCT ON (slug)
  slug,
  id AS keep_id
FROM "Category"
WHERE "userId" IS NULL
ORDER BY slug, "createdAt" ASC, id ASC;

-- 2. Map every duplicate to its survivor.
CREATE TEMP TABLE category_remap AS
SELECT c.id AS old_id, s.keep_id
FROM "Category" c
JOIN category_survivor s ON s.slug = c.slug
WHERE c."userId" IS NULL
  AND c.id <> s.keep_id;

-- 3. Repoint every reference.
UPDATE "Transaction" t
SET "categoryId" = r.keep_id
FROM category_remap r
WHERE t."categoryId" = r.old_id;

UPDATE "RecurringTransaction" rt
SET "categoryId" = r.keep_id
FROM category_remap r
WHERE rt."categoryId" = r.old_id;

-- BudgetCategory has a UNIQUE(budgetId, categoryId): if a budget somehow
-- allocated to both the duplicate and the survivor, merge the amounts into the
-- survivor's row first, then drop the duplicate allocation.
UPDATE "BudgetCategory" target
SET "allocatedAmountMinor" = target."allocatedAmountMinor" + source."allocatedAmountMinor"
FROM "BudgetCategory" source
JOIN category_remap r ON r.old_id = source."categoryId"
WHERE target."budgetId" = source."budgetId"
  AND target."categoryId" = r.keep_id;

DELETE FROM "BudgetCategory" bc
USING category_remap r, "BudgetCategory" survivor
WHERE bc."categoryId" = r.old_id
  AND survivor."budgetId" = bc."budgetId"
  AND survivor."categoryId" = r.keep_id;

UPDATE "BudgetCategory" bc
SET "categoryId" = r.keep_id
FROM category_remap r
WHERE bc."categoryId" = r.old_id;

-- 4. Remove the now-unreferenced duplicates.
DELETE FROM "Category" c
USING category_remap r
WHERE c.id = r.old_id;

DROP TABLE category_remap;
DROP TABLE category_survivor;

-- 5. Make it impossible to happen again. A partial index is the right tool:
--    system categories are globally unique by slug, while each user keeps an
--    independent namespace for their own custom ones (still covered by the
--    existing Category_userId_slug_key).
CREATE UNIQUE INDEX "Category_system_slug_key"
  ON "Category" (slug)
  WHERE "userId" IS NULL;
