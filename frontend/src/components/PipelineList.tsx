import { useEffect, useRef, useState } from 'react'
import type { Pipeline } from '../api/client'

interface Props {
  pipelines: Pipeline[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export default function PipelineList({
  pipelines,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
}: Props) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (creating) inputRef.current?.focus()
  }, [creating])

  const openCreate = () => {
    setError('')
    setCreating(true)
  }

  const cancelCreate = () => {
    if (saving) return
    setName('')
    setError('')
    setCreating(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || saving) return

    setSaving(true)
    setError('')
    try {
      await onCreate(trimmed)
      setName('')
      setCreating(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pipeline')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await onDelete(id)
      setConfirmingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete pipeline')
      setConfirmingId(null)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          Pipelines
        </h2>
        {!creating && (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1 text-[13px] font-medium text-ink-secondary hover:text-ink px-2 py-1 -mr-2 rounded-md hover:bg-surface transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            New
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={handleSubmit} className="mb-2 space-y-2">
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (error) setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelCreate()
            }}
            placeholder="Pipeline name"
            disabled={saving}
            className="w-full text-[13px] rounded-lg border border-line-strong bg-panel px-3 py-2 placeholder:text-ink-muted focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/5 disabled:opacity-60"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="text-[12px] font-medium rounded-md bg-accent text-white px-2.5 py-1 hover:bg-accent-hover disabled:opacity-40 transition-colors"
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={cancelCreate}
              disabled={saving}
              className="text-[12px] text-ink-muted hover:text-ink px-1.5 py-1 disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-[12px] text-danger">{error}</p>}
        </form>
      )}

      {!creating && error && (
        <p className="mb-2 text-[12px] text-danger bg-danger-soft rounded-md px-2.5 py-1.5">{error}</p>
      )}

      <ul className="flex-1 overflow-y-auto -mx-1 space-y-0.5">
        {pipelines.length === 0 && !creating && (
          <li className="px-1 py-6 text-center">
            <p className="text-[13px] text-ink-muted">No pipelines yet.</p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-1 text-[13px] font-medium text-ink underline underline-offset-2 hover:no-underline"
            >
              Create your first
            </button>
          </li>
        )}
        {pipelines.map((p) => {
          const selected = selectedId === p.id
          const confirming = confirmingId === p.id
          const deleting = deletingId === p.id
          return (
            <li key={p.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className={`w-full flex items-center gap-2.5 text-left text-[13px] rounded-lg px-3 py-2 pr-9 transition-colors ${
                  selected
                    ? 'bg-surface font-medium text-ink'
                    : 'text-ink-secondary hover:bg-surface hover:text-ink'
                }`}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  className={`shrink-0 ${selected ? 'text-ink' : 'text-ink-muted'}`}
                  aria-hidden="true"
                >
                  <path
                    d="M2.5 4.5C2.5 3.4 3.4 2.5 4.5 2.5H6.3C6.8 2.5 7.2 2.7 7.5 3.1L8.2 4H11.5C12.6 4 13.5 4.9 13.5 6V11.5C13.5 12.6 12.6 13.5 11.5 13.5H4.5C3.4 13.5 2.5 12.6 2.5 11.5V4.5Z"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                </svg>
                <span className="truncate">{p.name}</span>
              </button>

              {confirming ? (
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    disabled={deleting}
                    className="text-[11px] font-medium text-danger bg-danger-soft rounded px-1.5 py-0.5 hover:brightness-95 transition disabled:opacity-50"
                  >
                    {deleting ? '…' : 'Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    disabled={deleting}
                    className="text-[11px] text-ink-muted hover:text-ink px-1 py-0.5 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setConfirmingId(p.id)}
                  aria-label={`Delete ${p.name}`}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-ink-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-danger hover:bg-danger-soft transition"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M2.5 4H13.5M6.5 7V11M9.5 7V11M3.5 4L4 12.5C4 13.3 4.7 14 5.5 14H10.5C11.3 14 12 13.3 12 12.5L12.5 4M6 4V2.5C6 2.2 6.2 2 6.5 2H9.5C9.8 2 10 2.2 10 2.5V4"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
