import { useCallback, useRef, useState } from 'react'
import type { Document } from '../api/client'

interface Props {
  documents: Document[]
  onUpload: (file: File) => Promise<void>
  onIngestLink: (url: string) => Promise<void>
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

export default function UploadZone({ documents, onUpload, onIngestLink, disabled }: Props) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const busy = uploading

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || disabled || busy) return
      setError('')
      setUploading(true)
      try {
        await onUpload(files[0])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [disabled, busy, onUpload],
  )

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

  return (
    <div className="shrink-0 border-t border-line p-4 max-h-[45%] flex flex-col">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-3">
        Documents
      </h2>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        disabled={disabled || busy}
        className={`w-full rounded-lg border border-dashed px-3 py-4 text-center transition-colors ${
          dragging
            ? 'border-ink bg-surface'
            : 'border-line-strong hover:border-ink-muted hover:bg-surface'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
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
            {busy ? 'Processing…' : disabled ? 'Select a pipeline first' : 'Upload a document'}
          </span>
          {!disabled && !busy && (
            <span className="text-[11px] text-ink-muted">PDF, TXT or MD · drag &amp; drop or click</span>
          )}
        </div>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md"
        className="hidden"
        disabled={disabled || busy}
        onChange={(e) => handleFiles(e.target.files)}
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
        <ul className="mt-3 space-y-1 overflow-y-auto">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
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
              <StatusBadge doc={doc} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
