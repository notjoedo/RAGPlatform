import { useCallback, useRef, useState } from 'react'
import type { Document } from '../api/client'
import { filterSupportedFiles, getFilesFromDataTransfer } from '../utils/files'

interface Props {
  documents: Document[]
  onUploadFiles: (files: File[]) => Promise<void>
  onIngestLink: (url: string) => Promise<void>
  onDeleteDocument: (documentId: string) => Promise<void>
  disabled: boolean
}

function StatusBadge({ doc }: { doc: Document }) {
  if (doc.status === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success bg-success-soft rounded-full px-2 py-0.5">
        <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {doc.chunk_count} chunks
      </span>
    )
  }
  if (doc.status === 'failed') {
    return (
      <span
        className="inline-flex items-center text-[11px] font-medium text-danger bg-danger-soft rounded-full px-2 py-0.5"
        title={doc.error ?? undefined}
      >
        Failed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-secondary bg-surface rounded-full px-2 py-0.5">
      <svg width="9" height="9" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden="true">
        <path d="M8 2C11.3 2 14 4.7 14 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      Indexing
    </span>
  )
}

export default function UploadZone({
  documents,
  onUploadFiles,
  onIngestLink,
  onDeleteDocument,
  disabled,
}: Props) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadLabel, setUploadLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [error, setError] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const busy = uploading || deletingId !== null

  const handleFiles = useCallback(
    async (files: File[]) => {
      const supported = filterSupportedFiles(files)
      if (!supported.length || disabled || busy) {
        if (files.length && !supported.length) {
          setError('No supported files found. Use PDF, TXT, or MD.')
        }
        return
      }

      setError('')
      setUploading(true)
      setUploadLabel(
        supported.length === 1 ? 'Uploading…' : `Uploading ${supported.length} files…`,
      )
      try {
        await onUploadFiles(supported)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
        setUploadLabel('')
        if (fileInputRef.current) fileInputRef.current.value = ''
        if (folderInputRef.current) folderInputRef.current.value = ''
      }
    },
    [disabled, busy, onUploadFiles],
  )

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled || busy) return
    const files = await getFilesFromDataTransfer(e.dataTransfer)
    await handleFiles(files)
  }

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const url = linkUrl.trim()
    if (!url || disabled || busy) return
    setError('')
    setUploading(true)
    try {
      await onIngestLink(url)
      setLinkUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ingest link')
    } finally {
      setUploading(false)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').trim()
    if (!pasted || disabled || busy) return
    if (/^https?:\/\//i.test(pasted)) {
      e.preventDefault()
      setLinkUrl(pasted)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setError('')
    try {
      await onDeleteDocument(id)
      setConfirmingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete source')
      setConfirmingId(null)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0 p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-3">
        Sources
      </h2>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`w-full rounded-lg border border-dashed px-3 py-4 text-center transition-colors ${
          dragging
            ? 'border-ink bg-surface'
            : 'border-line-strong hover:border-ink-muted hover:bg-surface'
        } ${disabled ? 'opacity-40' : ''}`}
      >
        <div className="flex flex-col items-center gap-1.5">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="text-ink-muted" aria-hidden="true">
            <path
              d="M8 10.5V2.5M8 2.5L4.5 6M8 2.5L11.5 6M2.5 10.5V12C2.5 12.8 3.2 13.5 4 13.5H12C12.8 13.5 13.5 12.8 13.5 12V10.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[13px] font-medium text-ink-secondary">
            {busy
              ? uploadLabel || 'Processing…'
              : disabled
                ? 'Select a pipeline first'
                : 'Add documents'}
          </span>
          {!disabled && !busy && (
            <span className="text-[11px] text-ink-muted">
              PDF, TXT or MD · drag files or a folder here
            </span>
          )}
          {!disabled && !busy && (
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-medium text-accent hover:text-accent-hover transition-colors"
              >
                Browse files
              </button>
              <span className="text-ink-muted">·</span>
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="text-[11px] font-medium text-accent hover:text-accent-hover transition-colors"
              >
                Browse folder
              </button>
            </div>
          )}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md"
        multiple
        className="hidden"
        disabled={disabled || busy}
        onChange={(e) => {
          if (e.target.files) void handleFiles(Array.from(e.target.files))
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        className="hidden"
        disabled={disabled || busy}
        onChange={(e) => {
          if (e.target.files) void handleFiles(Array.from(e.target.files))
        }}
      />

      <form onSubmit={handleLinkSubmit} className="mt-3 flex gap-2" onPaste={handlePaste}>
        <input
          type="url"
          value={linkUrl}
          onChange={(e) => {
            setLinkUrl(e.target.value)
            if (error) setError('')
          }}
          placeholder="Paste a link…"
          disabled={disabled || busy}
          className="flex-1 min-w-0 text-[13px] rounded-lg border border-line-strong bg-panel px-3 py-2 placeholder:text-ink-muted focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/5 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || busy || !linkUrl.trim()}
          className="shrink-0 text-[12px] font-medium rounded-lg bg-accent text-white px-3 py-2 hover:bg-accent-hover disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </form>

      {error && (
        <p className="mt-2 text-[12px] text-danger bg-danger-soft rounded-md px-2.5 py-1.5">{error}</p>
      )}

      {documents.length > 0 && (
        <ul className="mt-3 space-y-1 overflow-y-auto min-h-0">
          {documents.map((doc) => {
            const confirming = confirmingId === doc.id
            const deleting = deletingId === doc.id
            return (
              <li
                key={doc.id}
                className="group relative flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 pr-8">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="shrink-0 text-ink-muted" aria-hidden="true">
                    <path
                      d="M9 1.5H4.5C3.7 1.5 3 2.2 3 3V13C3 13.8 3.7 14.5 4.5 14.5H11.5C12.3 14.5 13 13.8 13 13V5.5M9 1.5L13 5.5M9 1.5V4.5C9 5.1 9.4 5.5 10 5.5H13"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-[13px] text-ink-secondary truncate" title={doc.filename}>
                    {doc.filename}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <StatusBadge doc={doc} />
                  {confirming ? (
                    <div className="flex items-center gap-1 ml-1">
                      <button
                        type="button"
                        onClick={() => handleDelete(doc.id)}
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
                      onClick={() => setConfirmingId(doc.id)}
                      disabled={disabled || busy}
                      aria-label={`Delete ${doc.filename}`}
                      className="p-1 rounded-md text-ink-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-danger hover:bg-danger-soft transition disabled:opacity-40"
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
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
