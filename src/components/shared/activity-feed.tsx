import { Avatar, Badge, EmptyState } from '@/components/ui/primitives';
import { Money } from '@/components/ui/money-display';
import { activityTag, describeActivity } from '@/lib/activity';
import { formatAge } from '@/lib/date';
import { formatMoney } from '@/lib/money';
import { cn, firstName } from '@/lib/utils';
import type { ActivityRow } from '@/server/queries/collaboration';

/**
 * The shared activity timeline.
 *
 * Entries are read from the Activity table — they are recorded in the same
 * database transaction as the change they describe, so the feed is an audit
 * trail rather than a reconstruction of client state.
 */
export function ActivityFeed({
  entries,
  currency,
  currentUserId,
  compact,
}: {
  entries: ActivityRow[];
  currency: string;
  currentUserId: string;
  compact?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        headline="Nothing has happened yet."
        body="Once either of you adds an expense, changes the budget or contributes to a goal, it shows up here."
      />
    );
  }

  return (
    <ol className="flex flex-col">
      {entries.map((entry) => {
        const line = describeActivity(entry.action, entry.metadata);
        const isSelf = entry.actor.id === currentUserId;

        return (
          <li
            key={entry.id}
            className="flex gap-3 border-b border-line-faint py-3.5 last:border-0"
          >
            <Avatar
              name={entry.actor.name}
              size="sm"
              tone={isSelf ? 'forest' : 'outline'}
              className="mt-0.5"
            />

            <div className="min-w-0 flex-1">
              <p className="text-[0.875rem] leading-snug text-ink-2">
                <span className="font-semibold text-ink">
                  {isSelf ? 'You' : firstName(entry.actor.name)}
                </span>{' '}
                {line.lead}
                {line.amountMinor !== undefined ? (
                  <>
                    {' '}
                    <span
                      className={cn(
                        'ex-numeral',
                        line.tone === 'warning'
                          ? 'text-coral'
                          : line.tone === 'positive'
                            ? 'text-positive'
                            : 'text-ink',
                      )}
                    >
                      {formatMoney(line.amountMinor, currency, { compactDecimals: true })}
                    </span>
                  </>
                ) : null}
                {line.strong ? <span className="font-semibold text-ink"> {line.strong}</span> : null}
                {line.trail ? <span> {line.trail}</span> : null}
                {line.change ? (
                  <>
                    {' '}
                    <span className="ex-numeral text-ink-3">
                      {formatMoney(line.change.from, currency, { compactDecimals: true })}
                    </span>
                    <span aria-hidden="true" className="text-ink-faint">
                      {' → '}
                    </span>
                    <span className="ex-numeral text-ink">
                      {formatMoney(line.change.to, currency, { compactDecimals: true })}
                    </span>
                  </>
                ) : null}
              </p>

              <p className="mt-1.5 flex items-center gap-2">
                {!compact ? <Badge tone="outline">{activityTag(entry.action)}</Badge> : null}
                <span className="font-mono text-[0.625rem] tracking-[0.08em] text-ink-faint">
                  {formatAge(entry.createdAt)}
                </span>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
