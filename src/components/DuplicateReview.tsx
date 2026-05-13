import { invoke } from '@tauri-apps/api/core'
import { CheckCheck, Copy, Film, Loader2, ShieldCheck, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DuplicateSet, DuplicateVideo } from '../types'

// ── Thumbnail mini ────────────────────────────────────────────────────────────

function MiniThumb({ video }: { video: DuplicateVideo }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!video.thumbnail_path) return
    invoke<string>('get_thumbnail', { path: video.thumbnail_path })
      .then(setSrc)
      .catch(() => {})
  }, [video.thumbnail_path])

  return (
    <div className="relative">
      <div className="w-full aspect-video bg-zinc-700 rounded overflow-hidden flex items-center justify-center">
        {src
          ? <img src={src} alt={video.file_name} className="w-full h-full object-cover" />
          : <Film className="w-6 h-6 text-zinc-600" />}
      </div>
      <p className="text-[10px] text-zinc-400 truncate mt-1">{video.file_name}</p>
      <p className={`text-[10px] font-medium mt-0.5 ${video.entity_is_unsorted ? 'text-amber-400' : 'text-blue-400'}`}>
        {video.entity_name}
      </p>
      {video.file_size && (
        <p className="text-[10px] text-zinc-600">{(video.file_size / 1_000_000).toFixed(0)} MB</p>
      )}
    </div>
  )
}

// ── Confidence badge ──────────────────────────────────────────────────────────

const CONFIDENCE_STYLES: Record<string, string> = {
  exact: 'bg-red-900/60 text-red-300',
  likely: 'bg-amber-900/60 text-amber-300',
  possible: 'bg-zinc-700 text-zinc-400',
}
const CONFIDENCE_LABELS: Record<string, string> = {
  exact: 'Exact duplicate',
  likely: 'Likely duplicate',
  possible: 'Possible duplicate',
}

// ── Single set card ───────────────────────────────────────────────────────────

function SetCard({
  set, index, onResolved,
}: { set: DuplicateSet; index: number; onResolved: (i: number) => void }) {
  const [keepId, setKeepId] = useState<number | null>(set.suggested_keep_id)
  const [working, setWorking] = useState(false)

  const apply = async () => {
    if (!keepId) return
    setWorking(true)
    const deleteIds = set.videos.filter((v) => v.id !== keepId).map((v) => v.id)
    await invoke('resolve_duplicate', { keepId, deleteIds })
    onResolved(index)
    setWorking(false)
  }

  const actionLabel =
    set.suggested_action === 'delete_unsorted'
      ? 'Delete unsorted copy, keep entity copy'
      : 'Keep one, link to other entities'

  return (
    <div className="bg-zinc-800 rounded-lg p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${CONFIDENCE_STYLES[set.confidence]}`}>
          {CONFIDENCE_LABELS[set.confidence]}
        </span>
        <span className="text-xs text-zinc-500">{actionLabel}</span>
      </div>

      {/* Thumbnails */}
      <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${set.videos.length}, 1fr)` }}>
        {set.videos.map((video) => (
          <button
            key={video.id}
            onClick={() => setKeepId(video.id)}
            className={`text-left rounded-lg p-2 transition-all ${
              keepId === video.id
                ? 'ring-2 ring-blue-500 bg-zinc-700/50'
                : 'ring-1 ring-zinc-700 hover:ring-zinc-500'
            }`}
          >
            <MiniThumb video={video} />
            {keepId === video.id && (
              <div className="flex items-center gap-1 mt-1.5 text-[10px] text-blue-400">
                <ShieldCheck className="w-3 h-3" /> Keep this one
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Action */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] text-zinc-600">
          {keepId
            ? `Will delete ${set.videos.length - 1} copy${set.videos.length > 2 ? 'ies' : ''}`
            : 'Click a thumbnail to select which to keep'}
        </p>
        <button
          onClick={apply}
          disabled={!keepId || working}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded text-xs font-medium transition-colors"
        >
          {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Resolve
        </button>
      </div>
    </div>
  )
}

// ── Main overlay ──────────────────────────────────────────────────────────────

export function DuplicateReview({ onClose }: { onClose: () => void }) {
  const [sets, setSets] = useState<DuplicateSet[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [resolved, setResolved] = useState<Set<number>>(new Set())
  const [approving, setApproving] = useState(false)

  useEffect(() => {
    invoke<DuplicateSet[]>('find_duplicates')
      .then(setSets)
      .finally(() => setLoading(false))
  }, [])

  const markResolved = (i: number) =>
    setResolved((prev) => new Set([...prev, i]))

  const approveAll = async () => {
    if (!sets) return
    setApproving(true)
    const pending = sets.filter((s, i) => !resolved.has(i) && s.suggested_keep_id !== null)
    for (let i = 0; i < pending.length; i++) {
      const s = pending[i]
      const deleteIds = s.videos.filter((v) => v.id !== s.suggested_keep_id).map((v) => v.id)
      await invoke('resolve_duplicate', { keepId: s.suggested_keep_id, deleteIds })
    }
    // Mark all as resolved
    if (sets) setResolved(new Set(sets.map((_, i) => i)))
    setApproving(false)
  }

  const pendingSets = sets?.filter((_, i) => !resolved.has(i)) ?? []
  const allDone = sets !== null && pendingSets.length === 0

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
      <div className="bg-zinc-900 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <Copy className="w-5 h-5 text-zinc-400" />
            <div>
              <h2 className="font-semibold text-zinc-100">Duplicate Review</h2>
              {sets && !loading && (
                <p className="text-xs text-zinc-500">
                  {allDone ? 'All resolved' : `${pendingSets.length} set${pendingSets.length !== 1 ? 's' : ''} to review`}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sets && pendingSets.length > 0 && (
              <button
                onClick={approveAll}
                disabled={approving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 rounded text-xs font-medium transition-colors"
              >
                {approving
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <CheckCheck className="w-3.5 h-3.5" />}
                Approve All
              </button>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Scanning for duplicates…</span>
            </div>
          )}

          {!loading && sets?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-500">
              <ShieldCheck className="w-10 h-10" />
              <p className="text-sm font-medium">No duplicates found</p>
              <p className="text-xs text-zinc-600">All videos appear to be unique</p>
            </div>
          )}

          {allDone && sets && sets.length > 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-500">
              <ShieldCheck className="w-10 h-10 text-green-400" />
              <p className="text-sm font-medium text-green-400">All duplicates resolved</p>
            </div>
          )}

          {sets?.map((set, i) =>
            resolved.has(i) ? null : (
              <SetCard key={i} set={set} index={i} onResolved={markResolved} />
            )
          )}
        </div>
      </div>
    </div>
  )
}
