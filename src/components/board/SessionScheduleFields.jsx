import React from 'react';
import { WEEKDAY_OPTIONS } from '@/lib/sessionSchedule';

/**
 * @param {{
 *   idPrefix?: string,
 *   disabled?: boolean,
 *   value: { cadence: string, weekday: number, monthlyMode: string, dayOfMonth: number, biweeklyAnchorDate?: string|null },
 *   onChange: (patch: Partial<{ cadence: string, weekday: number, monthlyMode: string, dayOfMonth: number, biweeklyAnchorDate?: string|null }>) => void,
 * }} props
 */
export default function SessionScheduleFields({ idPrefix = 'session-sched', disabled, value, onChange }) {
  const { cadence, weekday, monthlyMode, dayOfMonth } = value;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-cadence`} className="text-sm font-medium text-foreground">
          How often should a new session start?
        </label>
        <select
          id={`${idPrefix}-cadence`}
          value={cadence}
          disabled={disabled}
          onChange={(e) => onChange({ cadence: e.target.value, biweeklyAnchorDate: null })}
          className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Bi-weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          Sessions use your device&apos;s <strong className="text-foreground">local calendar day</strong> (midnight
          local time). When the schedule boundary is reached, any still-open session from an earlier period is closed
          and a new empty session starts for that period. Closed sessions stay listed under Past sessions.
        </p>
      </div>

      {(cadence === 'weekly' || cadence === 'biweekly') && (
        <div>
          <label htmlFor={`${idPrefix}-weekday`} className="text-xs font-medium text-foreground">
            Day of the week
          </label>
          <select
            id={`${idPrefix}-weekday`}
            value={String(weekday)}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                cadence === 'biweekly'
                  ? { weekday: Number(e.target.value), biweeklyAnchorDate: null }
                  : { weekday: Number(e.target.value) }
              )
            }
            className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
          >
            {WEEKDAY_OPTIONS.map((o) => (
              <option key={o.value} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
          {cadence === 'biweekly' ? (
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              The first period begins on the <strong className="text-foreground">next</strong> occurrence of that weekday
              (including today if today matches). After you save, every second occurrence starts a new session at the
              start of that local day.
            </p>
          ) : null}
        </div>
      )}

      {cadence === 'monthly' && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-foreground">Monthly on</p>
          <div className="grid gap-2">
            <label className="flex items-start gap-2 rounded-xl border border-border/80 px-3 py-2.5 cursor-pointer hover:bg-muted/30">
              <input
                type="radio"
                name={`${idPrefix}-monthly`}
                checked={monthlyMode === 'day_of_month'}
                disabled={disabled}
                onChange={() => onChange({ monthlyMode: 'day_of_month' })}
                className="mt-1"
              />
              <span className="flex-1 min-w-0">
                <span className="text-sm text-foreground block">A calendar day each month</span>
                <span className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">Day</span>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={dayOfMonth}
                    disabled={disabled || monthlyMode !== 'day_of_month'}
                    onChange={(e) => onChange({ dayOfMonth: Number(e.target.value) })}
                    className="w-16 rounded-lg border border-input bg-background px-2 py-1 text-sm tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground">(uses last day in shorter months)</span>
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-xl border border-border/80 px-3 py-2.5 cursor-pointer hover:bg-muted/30">
              <input
                type="radio"
                name={`${idPrefix}-monthly`}
                checked={monthlyMode === 'first_weekday'}
                disabled={disabled}
                onChange={() => onChange({ monthlyMode: 'first_weekday' })}
                className="mt-1"
              />
              <span className="flex-1 min-w-0">
                <span className="text-sm text-foreground block">First weekday of the month</span>
                <select
                  value={String(weekday)}
                  disabled={disabled || monthlyMode !== 'first_weekday'}
                  onChange={(e) => onChange({ weekday: Number(e.target.value) })}
                  className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  {WEEKDAY_OPTIONS.map((o) => (
                    <option key={o.value} value={String(o.value)}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
