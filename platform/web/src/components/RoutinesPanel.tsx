import { useState } from 'react'
import type { Routine } from '../lib/api'
import {
  useRoutines,
  useCreateRoutine,
  useToggleRoutine,
  useDeleteRoutine,
  useRunRoutine,
} from '../lib/queries'

interface RoutinesPanelProps {
  isOpen: boolean
  onClose: () => void
  employeeId: string
  employeeName?: string
}

const COMMON_SCHEDULES = [
  { label: 'Every 5 min', expr: '*/5 * * * *' },
  { label: 'Every hour', expr: '0 * * * *' },
  { label: 'Daily 9 AM', expr: '0 9 * * *' },
  { label: 'Weekdays 9 AM', expr: '0 9 * * 1-5' },
  { label: 'Weekly Mon 9 AM', expr: '0 9 * * 1' },
]

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return `${Math.floor(diff / 86400_000)}d ago`
}

function formatNextRun(ms: number): string {
  const diff = ms - Date.now()
  if (diff < 0) return 'overdue'
  if (diff < 60_000) return 'in <1m'
  if (diff < 3600_000) return `in ${Math.floor(diff / 60_000)}m`
  if (diff < 86400_000) return `in ${Math.floor(diff / 3600_000)}h`
  return `in ${Math.floor(diff / 86400_000)}d`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function getScheduleLabel(schedule: Routine['schedule']): string {
  if (schedule.kind === 'cron') return schedule.expr
  if (schedule.kind === 'every') return `every ${formatDuration(schedule.everyMs)}`
  if (schedule.kind === 'at') return `once at ${new Date(schedule.atMs).toLocaleString()}`
  return 'unknown'
}

export function RoutinesPanel({ isOpen, onClose, employeeId, employeeName }: RoutinesPanelProps) {
  const [showForm, setShowForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data: routines, isLoading, error } = useRoutines(employeeId, isOpen)
  const createMutation = useCreateRoutine(employeeId)
  const toggleMutation = useToggleRoutine(employeeId)
  const deleteMutation = useDeleteRoutine(employeeId)
  const runMutation = useRunRoutine(employeeId)

  return (
    <>
      {/* Backdrop */}
      <div
        className={`workspace-backdrop ${isOpen ? 'workspace-backdrop--open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className={`workspace-panel ${isOpen ? 'workspace-panel--open' : ''}`}>
        <div className="workspace-panel__header">
          <h2>Routines</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              onClick={() => setShowForm(!showForm)}
              style={{ padding: '6px 12px', fontSize: 13 }}
            >
              {showForm ? 'Cancel' : '+ New'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={onClose}
              title="Close"
              aria-label="Close routines"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="workspace-panel__content">
          {/* Create Form */}
          {showForm && (
            <CreateRoutineForm
              employeeName={employeeName}
              onSubmit={async (data) => {
                await createMutation.mutateAsync(data)
                setShowForm(false)
              }}
              isPending={createMutation.isPending}
              error={createMutation.error}
            />
          )}

          {/* Loading */}
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <div className="loading" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: 16, color: '#ef4444', textAlign: 'center' }}>
              <p>{error instanceof Error ? error.message : 'Failed to load routines'}</p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && routines?.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 16px', opacity: 0.5 }}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <p style={{ margin: '0 0 8px', fontWeight: 500, color: 'var(--text-strong)' }}>
                No routines yet
              </p>
              <p style={{ margin: 0, fontSize: 13 }}>
                Create a routine to have {employeeName || 'this agent'} run tasks on a schedule.
              </p>
            </div>
          )}

          {/* Routines List */}
          {routines && routines.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
              {routines.map((routine) => (
                <RoutineCard
                  key={routine.id}
                  routine={routine}
                  onToggle={(enabled) => toggleMutation.mutate({ id: routine.id, enabled })}
                  onRun={() => runMutation.mutate(routine.id)}
                  onDelete={() => {
                    if (deleteMutation.isPending) return
                    if (deleteConfirm === routine.id) {
                      deleteMutation.mutate(routine.id)
                      setDeleteConfirm(null)
                    } else {
                      setDeleteConfirm(routine.id)
                    }
                  }}
                  deleteConfirm={deleteConfirm === routine.id}
                  onCancelDelete={() => setDeleteConfirm(null)}
                  isRunning={runMutation.isPending && runMutation.variables === routine.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ============= Create Form =============

function CreateRoutineForm({
  employeeName,
  onSubmit,
  isPending,
  error,
}: {
  employeeName?: string
  onSubmit: (data: { name: string; schedule: string; message: string; tz?: string }) => Promise<void>
  isPending: boolean
  error: Error | null
}) {
  const [name, setName] = useState('')
  const [schedule, setSchedule] = useState('')
  const [message, setMessage] = useState('')
  const [tz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !schedule.trim() || !message.trim()) return
    try {
      await onSubmit({ name: name.trim(), schedule: schedule.trim(), message: message.trim(), tz })
      setName('')
      setSchedule('')
      setMessage('')
    } catch {
      // Error shown via mutation.error
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: 16,
        background: 'var(--panel-strong)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'var(--text-strong)' }}>
          Name
        </label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Daily content ideas"
          required
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'var(--text-strong)' }}>
          Schedule (cron)
        </label>
        <input
          className="input"
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          placeholder="0 9 * * *"
          required
          style={{ width: '100%', fontFamily: 'monospace' }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {COMMON_SCHEDULES.map((s) => (
            <button
              key={s.expr}
              type="button"
              onClick={() => setSchedule(s.expr)}
              style={{
                padding: '2px 8px',
                fontSize: 11,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: schedule === s.expr ? 'var(--accent-subtle)' : 'transparent',
                color: schedule === s.expr ? 'var(--accent)' : 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'var(--text-strong)' }}>
          Timezone
        </label>
        <input
          className="input"
          value={tz}
          disabled
          style={{ width: '100%', opacity: 0.7 }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'var(--text-strong)' }}>
          What should {employeeName || 'this agent'} do?
        </label>
        <textarea
          className="input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Generate 3 content ideas for this week..."
          required
          rows={3}
          style={{ width: '100%', resize: 'vertical' }}
        />
      </div>

      {error && (
        <div style={{ fontSize: 13, color: '#ef4444' }}>
          {error.message}
        </div>
      )}

      <button className="btn" type="submit" disabled={isPending || !name.trim() || !schedule.trim() || !message.trim()}>
        {isPending ? 'Creating...' : 'Create Routine'}
      </button>
    </form>
  )
}

// ============= Routine Card =============

function RoutineCard({
  routine,
  onToggle,
  onRun,
  onDelete,
  deleteConfirm,
  onCancelDelete,
  isRunning,
}: {
  routine: Routine
  onToggle: (enabled: boolean) => void
  onRun: () => void
  onDelete: () => void
  deleteConfirm: boolean
  onCancelDelete: () => void
  isRunning: boolean
}) {
  const scheduleLabel = getScheduleLabel(routine.schedule)
  const tz = routine.schedule.kind === 'cron' ? routine.schedule.tz : undefined

  return (
    <div
      style={{
        padding: 14,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        opacity: routine.enabled ? 1 : 0.6,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {routine.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <code style={{ fontSize: 11, padding: '1px 4px', background: 'var(--panel-strong)', borderRadius: 3 }}>
              {scheduleLabel}
            </code>
            {tz && <span>{tz}</span>}
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => onToggle(!routine.enabled)}
          style={{
            width: 36,
            height: 20,
            borderRadius: 10,
            border: 'none',
            background: routine.enabled ? 'var(--accent)' : 'var(--border)',
            position: 'relative',
            cursor: 'pointer',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
          title={routine.enabled ? 'Disable' : 'Enable'}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'white',
              position: 'absolute',
              top: 2,
              left: routine.enabled ? 18 : 2,
              transition: 'left 0.2s',
            }}
          />
        </button>
      </div>

      {/* Message preview */}
      {routine.payload.kind === 'agentTurn' && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
          {routine.payload.message}
        </div>
      )}

      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
        {routine.state.lastRunAtMs && (
          <>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: routine.state.lastStatus === 'ok' ? '#22c55e' : routine.state.lastStatus === 'error' ? '#ef4444' : '#f59e0b',
                flexShrink: 0,
              }}
            />
            <span>
              Last: {formatRelativeTime(routine.state.lastRunAtMs)}
              {routine.state.lastDurationMs != null && ` (${formatDuration(routine.state.lastDurationMs)})`}
            </span>
          </>
        )}
        {routine.state.nextRunAtMs && routine.enabled && (
          <span style={{ marginLeft: 'auto' }}>
            Next: {formatNextRun(routine.state.nextRunAtMs)}
          </span>
        )}
      </div>

      {/* Last error */}
      {routine.state.lastError && (
        <div style={{ fontSize: 11, color: '#ef4444', padding: '4px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: 4, marginBottom: 8 }}>
          {routine.state.lastError}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-ghost"
          onClick={onRun}
          disabled={isRunning}
          style={{ padding: '4px 10px', fontSize: 12 }}
        >
          {isRunning ? 'Running...' : 'Run Now'}
        </button>
        {deleteConfirm ? (
          <>
            <button
              className="btn btn-ghost"
              onClick={onDelete}
              style={{ padding: '4px 10px', fontSize: 12, color: '#ef4444' }}
            >
              Confirm
            </button>
            <button
              className="btn btn-ghost"
              onClick={onCancelDelete}
              style={{ padding: '4px 10px', fontSize: 12 }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            className="btn btn-ghost"
            onClick={onDelete}
            style={{ padding: '4px 10px', fontSize: 12, color: '#ef4444' }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
