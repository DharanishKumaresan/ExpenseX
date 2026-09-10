import type { ActivityAction } from '@prisma/client';

/**
 * Rendering for the shared activity feed.
 *
 * Activity rows are stored as structured facts (actor + action + entity +
 * metadata), never as pre-baked sentences. This module is the single place
 * that turns them into English, so the wording can change without a migration.
 */

export interface ActivityMetadata {
  /** Human label for the entity: merchant, goal name, category name. */
  label?: string;
  amountMinor?: number;
  currency?: string;
  /** Before/after for edits, already in minor units where monetary. */
  previousAmountMinor?: number;
  newAmountMinor?: number;
  previousValue?: string;
  newValue?: string;
  categoryName?: string;
  memberName?: string;
  /** Percentage of the allocation used, for BUDGET_EXCEEDED. */
  percentUsed?: number;
}

export interface ActivityLine {
  /** Text before the emphasised part. */
  lead: string;
  /** Emphasised entity name, rendered in the ink colour. */
  strong?: string;
  /** Trailing text after the emphasis. */
  trail?: string;
  /** Rendered as a monospaced figure when present. */
  amountMinor?: number;
  /** "₹10,000 → ₹12,000" style change, already formatted by the caller. */
  change?: { from: number; to: number };
  tone: 'neutral' | 'positive' | 'warning';
}

export function describeActivity(
  action: ActivityAction,
  metadata: ActivityMetadata | null | undefined,
): ActivityLine {
  const meta = metadata ?? {};
  const label = meta.label ?? 'an item';

  switch (action) {
    case 'WORKSPACE_CREATED':
      return { lead: 'created the shared space', strong: label, tone: 'neutral' };

    case 'WORKSPACE_SETTINGS_UPDATED':
      return {
        lead: 'updated the space settings',
        trail: meta.previousValue && meta.newValue ? `${meta.previousValue} → ${meta.newValue}` : undefined,
        tone: 'neutral',
      };

    case 'MEMBER_INVITED':
      return { lead: 'invited', strong: meta.memberName ?? label, tone: 'neutral' };

    case 'MEMBER_JOINED':
      return { lead: 'joined the shared space', tone: 'positive' };

    case 'MEMBER_REMOVED':
      return { lead: 'removed', strong: meta.memberName ?? label, tone: 'warning' };

    case 'MEMBER_LEFT':
      return { lead: 'left the shared space', tone: 'warning' };

    case 'INVITATION_DECLINED':
      return { lead: 'declined the invitation', tone: 'neutral' };

    case 'TRANSACTION_CREATED':
      return {
        lead: 'added',
        amountMinor: meta.amountMinor,
        trail: meta.categoryName ? `${meta.categoryName} · ${label}` : label,
        tone: 'neutral',
      };

    case 'TRANSACTION_UPDATED':
      return {
        lead: 'edited',
        strong: label,
        change:
          meta.previousAmountMinor !== undefined && meta.newAmountMinor !== undefined
            ? { from: meta.previousAmountMinor, to: meta.newAmountMinor }
            : undefined,
        tone: 'neutral',
      };

    case 'TRANSACTION_DELETED':
      // Reads as: "Alex deleted a ₹450 expense — Uber"
      return {
        lead: 'deleted a',
        amountMinor: meta.amountMinor,
        trail: `expense — ${label}`,
        tone: 'warning',
      };

    case 'BUDGET_CREATED':
      // Reads as: "You created a ₹50,000 budget for September 2026"
      return {
        lead: 'created a',
        amountMinor: meta.amountMinor,
        strong: 'budget',
        trail: `for ${label}`,
        tone: 'neutral',
      };

    case 'BUDGET_UPDATED':
      return {
        lead: 'changed',
        strong: meta.categoryName ? `${meta.categoryName} budget` : `${label} budget`,
        change:
          meta.previousAmountMinor !== undefined && meta.newAmountMinor !== undefined
            ? { from: meta.previousAmountMinor, to: meta.newAmountMinor }
            : undefined,
        tone: 'neutral',
      };

    case 'BUDGET_EXCEEDED':
      // Reads as: "Alex went ₹1,240 over the Shopping budget"
      return {
        lead: 'went',
        amountMinor: meta.amountMinor,
        trail: `over the ${meta.categoryName ?? label} budget`,
        tone: 'warning',
      };

    case 'GOAL_CREATED':
      // Reads as: "You created a ₹50,000 goal — Goa Trip"
      return {
        lead: 'created a',
        amountMinor: meta.amountMinor,
        strong: 'goal',
        trail: `— ${label}`,
        tone: 'positive',
      };

    case 'GOAL_UPDATED':
      return {
        lead: 'updated the goal',
        strong: label,
        change:
          meta.previousAmountMinor !== undefined && meta.newAmountMinor !== undefined
            ? { from: meta.previousAmountMinor, to: meta.newAmountMinor }
            : undefined,
        tone: 'neutral',
      };

    case 'GOAL_DELETED':
      return { lead: 'deleted the goal', strong: label, tone: 'warning' };

    case 'GOAL_CONTRIBUTION_ADDED':
      return { lead: 'added', amountMinor: meta.amountMinor, trail: `to ${label}`, tone: 'positive' };

    default:
      return { lead: 'made a change', tone: 'neutral' };
  }
}

/** Short uppercase tag shown alongside each entry. */
export function activityTag(action: ActivityAction): string {
  if (action.startsWith('TRANSACTION')) return 'TRANSACTION';
  if (action.startsWith('BUDGET')) return 'BUDGET';
  if (action.startsWith('GOAL')) return 'GOAL';
  if (action.startsWith('MEMBER') || action.startsWith('INVITATION')) return 'MEMBERS';
  return 'SPACE';
}
