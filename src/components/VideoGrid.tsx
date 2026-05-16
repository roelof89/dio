import { invoke } from '@tauri-apps/api/core'
import { ArrowDownAZ, ArrowUpAZ, Check, ChevronDown, Film, Link, MoveRight, Pencil, Plus, Star, Tag, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Category, Entity, Video } from '../types'
import { ConfirmModal } from './ConfirmModal'

// ── Thumbnail cache ───────────────────────────────────────────────────────────

const thumbCache = new Map<string, string>()

function ThumbnailImg({ path, alt }: { path: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(thumbCache.get(path) ?? null)
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Only mark visible once via IntersectionObserver
  useEffect(() => {
    if (src) return // already cached, no need to observe
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { rootMargin: '200px' }) // preload 200px before visible
    obs.observe(el)
    return () => obs.disconnect()
  }, [src])

  // Load thumbnail once visible
  useEffect(() => {
    if (src || !visible) return
    invoke<string>('get_thumbnail', { path })
      .then((d) => { thumbCache.set(path, d); setSrc(d) })
      .catch(() => {})
  }, [path, visible, src])

  if (!src) return <div ref={ref} className="w-full h-full flex items-center justify-center"><Film className="w-8 h-8 text-zinc-600" /></div>
  return <img src={src} alt={alt} className="w-full h-full object-cover" />
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

// ── Star Rating ───────────────────────────────────────────────────────────────

function StarRating({ videoId, rating, onUpdate }: { videoId: number; rating: number; onUpdate: () => void }) {
  const [hover, setHover] = useState(0)
  const handle = async (star: number) => {
    await invoke('update_video_rating', { videoId, rating: star === rating ? 0 : star })
    onUpdate()
  }
  return (
    <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star}
          onMouseEnter={() => setHover(star)} onMouseLeave={() => setHover(0)}
          onClick={() => handle(star)}
          className={`transition-colors ${star <= (hover || rating) ? 'text-yellow-400' : 'text-zinc-700 hover:text-zinc-500'}`}
        >
          <Star className="w-3 h-3" fill={star <= (hover || rating) ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  )
}

// ── Context menu shared helpers ───────────────────────────────────────────────

function refreshLists() {
  invoke<Entity[]>('get_entities').then(useStore.getState().setEntities).catch(() => {})
  invoke<Category[]>('get_categories').then(useStore.getState().setCategories).catch(() => {})
}

/** Compute menu position so it stays within the viewport. Opens upward if near the bottom. */
function menuPosition(x: number, y: number, menuWidth = 210) {
  const pad = 8
  const left = Math.min(x, window.innerWidth - menuWidth - pad)
  const openUp = y > window.innerHeight * 0.6
  return openUp
    ? { left, bottom: window.innerHeight - y, maxHeight: y - pad }
    : { left, top: y, maxHeight: window.innerHeight - y - pad }
}

// ── Single-video context menu ─────────────────────────────────────────────────

function ContextMenu({ x, y, video, onClose, onRefresh }: {
  x: number; y: number; video: Video; onClose: () => void; onRefresh: () => void
}) {
  const { entities, categories } = useStore()
  const [step, setStep] = useState<null | 'move' | 'link' | 'cats' | 'rename'>(null)
  const [videoCats, setVideoCats] = useState<Category[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    refreshLists()
    invoke<Category[]>('get_video_categories', { videoId: video.id }).then(setVideoCats)
  }, [video.id])

  const pos = menuPosition(x, y)
  const base = 'fixed bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl py-1 z-50 text-sm w-52'
  const row  = 'w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 transition-colors'

  const handleMove = async (id: number) => {
    try { await invoke('move_video_to_entity', { videoId: video.id, targetEntityId: id }) }
    catch (e) { setErr(String(e)); setStep(null); return }
    await onRefresh(); onClose()
  }
  const handleToggleCat = async (catId: number) => {
    const on = videoCats.some((c) => c.id === catId)
    await invoke(on ? 'remove_video_category' : 'add_video_category', { videoId: video.id, categoryId: catId })
    invoke<Category[]>('get_video_categories', { videoId: video.id }).then(setVideoCats)
  }
  const executeDelete = async () => {
    setShowDeleteConfirm(false)
    try { await invoke('delete_video', { videoId: video.id }); await onRefresh(); onClose() }
    catch (e) { setErr(String(e)) }
  }

  const handleRename = async () => {
    try {
      await invoke('rename_video', { videoId: video.id, newName: renameValue })
      await onRefresh(); onClose()
    } catch (e) { setErr(String(e)); setStep(null) }
  }

  // Strip extension for the rename input
  const nameWithoutExt = (name: string) => {
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.substring(0, dot) : name
  }

  const handleLink = async (id: number) => {
    try { await invoke('link_video_to_entity', { videoId: video.id, targetEntityId: id }) }
    catch (e) { setErr(String(e)); setStep(null); return }
    onClose()
  }

  const others = entities.filter((e) => e.id !== video.entity_id)

  if (step === 'link') return (
    <div className={base} style={{ ...pos, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <button onClick={(e) => { e.stopPropagation(); setStep(null) }} className={`${row} text-zinc-400 text-xs shrink-0`}>← Back</button>
      <div className="border-t border-zinc-700 my-1 shrink-0" />
      <div className="overflow-y-auto min-h-0">
        {others.length === 0 ? <p className="px-3 py-1.5 text-xs text-zinc-500">No other entities</p>
          : others.map((e) => (
            <button key={e.id} onClick={(ev) => { ev.stopPropagation(); handleLink(e.id) }} className={row}>
              <Link className="w-3.5 h-3.5 text-zinc-400 shrink-0" />{e.name}
            </button>
          ))}
      </div>
    </div>
  )
  if (step === 'rename') return (
    <div className={base} style={pos}>
      {err && <p className="px-3 py-1.5 text-xs text-red-400 border-b border-zinc-700">{err}</p>}
      <form onSubmit={(e) => { e.preventDefault(); handleRename() }} className="p-2 space-y-2">
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          className="w-full px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded focus:outline-none focus:border-blue-500 text-zinc-200"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex gap-1 justify-end">
          <button type="button" onClick={(e) => { e.stopPropagation(); setStep(null) }}
            className="px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">Cancel</button>
          <button type="submit" onClick={(e) => e.stopPropagation()}
            className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors">Rename</button>
        </div>
      </form>
    </div>
  )
  if (step === 'move') return (
    <div className={base} style={{ ...pos, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <button onClick={(e) => { e.stopPropagation(); setStep(null) }} className={`${row} text-zinc-400 text-xs shrink-0`}>← Back</button>
      <div className="border-t border-zinc-700 my-1 shrink-0" />
      <div className="overflow-y-auto min-h-0">
        {others.length === 0 ? <p className="px-3 py-1.5 text-xs text-zinc-500">No other entities</p>
          : others.map((e) => (
            <button key={e.id} onClick={(ev) => { ev.stopPropagation(); handleMove(e.id) }} className={row}>
              <MoveRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />{e.name}
            </button>
          ))}
      </div>
    </div>
  )
  if (step === 'cats') return (
    <div className={base} style={{ ...pos, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <button onClick={(e) => { e.stopPropagation(); setStep(null) }} className={`${row} text-zinc-400 text-xs`}>← Back</button>
      <div className="border-t border-zinc-700 my-1" />
      {categories.length === 0 ? <p className="px-3 py-1.5 text-xs text-zinc-500">No categories yet</p>
        : categories.map((c) => {
          const on = videoCats.some((vc) => vc.id === c.id)
          return (
            <button key={c.id} onClick={(e) => { e.stopPropagation(); handleToggleCat(c.id) }} className={row}>
              <Check className={`w-3.5 h-3.5 shrink-0 ${on ? 'text-green-400' : 'opacity-0'}`} />
              {c.name}
            </button>
          )
        })}
    </div>
  )
  return (
    <div className={base} style={pos}>
      {showDeleteConfirm && (
        <ConfirmModal
          message={`Delete "${video.file_name}"?\n\nThis permanently removes the file.`}
          onConfirm={executeDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {err && <p className="px-3 py-1.5 text-xs text-red-400 border-b border-zinc-700">{err}</p>}
      <button onClick={(e) => { e.stopPropagation(); setRenameValue(nameWithoutExt(video.file_name)); setStep('rename') }} className={row}>
        <Pencil className="w-3.5 h-3.5 text-zinc-400" />Rename
      </button>
      <button onClick={(e) => { e.stopPropagation(); setStep('move') }} className={`${row} justify-between`}>
        <span className="flex items-center gap-2"><MoveRight className="w-3.5 h-3.5 text-zinc-400" />Move to entity</span>
        <span className="text-zinc-500 text-xs">&#9654;</span>
      </button>
      <button onClick={(e) => { e.stopPropagation(); setStep('link') }} className={`${row} justify-between`}>
        <span className="flex items-center gap-2"><Link className="w-3.5 h-3.5 text-zinc-400" />Link to entity</span>
        <span className="text-zinc-500 text-xs">&#9654;</span>
      </button>
      <button onClick={(e) => { e.stopPropagation(); setStep('cats') }} className={`${row} justify-between`}>
        <span className="flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 text-zinc-400" />Categories
          {videoCats.length > 0 && <span className="text-[10px] bg-indigo-600 text-white rounded px-1">{videoCats.length}</span>}
        </span>
        <span className="text-zinc-500 text-xs">&#9654;</span>
      </button>
      <div className="border-t border-zinc-700 my-1" />
      <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true) }} className={`${row} text-red-400`}>
        <Trash2 className="w-3.5 h-3.5 shrink-0" />Delete file
      </button>
    </div>
  )
}

// ── Bulk context menu ─────────────────────────────────────────────────────────

function BulkContextMenu({ x, y, selectedIds, onClose, onRefresh, onClearSelection }: {
  x: number; y: number; selectedIds: number[]
  onClose: () => void; onRefresh: () => void; onClearSelection: () => void
}) {
  const { entities, categories, addToQueue } = useStore()
  const [step, setStep] = useState<null | 'move' | 'add_cat' | 'rm_cat'>(null)
  const [working, setWorking] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => { refreshLists() }, [])

  const pos = menuPosition(x, y, 225)
  const base = 'fixed bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl py-1 z-50 text-sm w-56'
  const row  = 'w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 transition-colors'

  const runOnAll = async (fn: (id: number) => Promise<void>) => {
    setWorking(true)
    for (const id of selectedIds) { try { await fn(id) } catch {} }
    setWorking(false)
  }

  const handleMoveAll = async (targetEntityId: number) => {
    await runOnAll((id) => invoke('move_video_to_entity', { videoId: id, targetEntityId }))
    await onRefresh(); onClearSelection(); onClose()
  }
  const handleAddCatAll = async (catId: number) => {
    await runOnAll((id) => invoke('add_video_category', { videoId: id, categoryId: catId }))
    onClose()
  }
  const handleRmCatAll = async (catId: number) => {
    await runOnAll((id) => invoke('remove_video_category', { videoId: id, categoryId: catId }))
    onClose()
  }
  const executeDeleteAll = async () => {
    setShowDeleteConfirm(false)
    await runOnAll((id) => invoke('delete_video', { videoId: id }))
    await onRefresh(); onClearSelection(); onClose()
  }

  const backBtn = (e: React.MouseEvent) => { e.stopPropagation(); setStep(null) }

  if (step === 'move') return (
    <div className={base} style={{ ...pos, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <button onClick={backBtn} className={`${row} text-zinc-400 text-xs shrink-0`}>← Back</button>
      <div className="border-t border-zinc-700 my-1 shrink-0" />
      <div className="overflow-y-auto min-h-0">
        {entities.map((e) => (
          <button key={e.id} onClick={(ev) => { ev.stopPropagation(); handleMoveAll(e.id) }} className={row} disabled={working}>
            <MoveRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />{e.name}
          </button>
        ))}
      </div>
    </div>
  )
  if (step === 'add_cat') return (
    <div className={base} style={{ ...pos, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <button onClick={backBtn} className={`${row} text-zinc-400 text-xs`}>← Back</button>
      <div className="border-t border-zinc-700 my-1" />
      {categories.length === 0 ? <p className="px-3 py-1.5 text-xs text-zinc-500">No categories yet</p>
        : categories.map((c) => (
          <button key={c.id} onClick={(ev) => { ev.stopPropagation(); handleAddCatAll(c.id) }} className={row} disabled={working}>
            <Tag className="w-3.5 h-3.5 text-zinc-400 shrink-0" />{c.name}
          </button>
        ))}
    </div>
  )
  if (step === 'rm_cat') return (
    <div className={base} style={{ ...pos, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <button onClick={backBtn} className={`${row} text-zinc-400 text-xs`}>← Back</button>
      <div className="border-t border-zinc-700 my-1" />
      {categories.length === 0 ? <p className="px-3 py-1.5 text-xs text-zinc-500">No categories yet</p>
        : categories.map((c) => (
          <button key={c.id} onClick={(ev) => { ev.stopPropagation(); handleRmCatAll(c.id) }} className={row} disabled={working}>
            <Tag className="w-3.5 h-3.5 text-zinc-400 shrink-0" />{c.name}
          </button>
        ))}
    </div>
  )
  return (
    <div className={base} style={pos}>
      {showDeleteConfirm && (
        <ConfirmModal
          message={`Delete ${selectedIds.length} video${selectedIds.length !== 1 ? 's' : ''}?\n\nThis permanently removes the files.`}
          onConfirm={executeDeleteAll}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      <p className="px-3 py-1 text-[10px] font-semibold text-zinc-400 border-b border-zinc-700 mb-1">
        {selectedIds.length} videos selected
      </p>
      <button onClick={(e) => {
          e.stopPropagation()
          const { videos } = useStore.getState()
          selectedIds.forEach((id) => {
            const v = videos.find((vid) => vid.id === id)
            if (v) addToQueue(v)
          })
          onClose()
        }} className={row}>
        <Plus className="w-3.5 h-3.5 text-zinc-400" />Add to play tray
      </button>
      <div className="border-t border-zinc-700 my-1" />
      <button onClick={(e) => { e.stopPropagation(); setStep('move') }} className={`${row} justify-between`} disabled={working}>
        <span className="flex items-center gap-2"><MoveRight className="w-3.5 h-3.5 text-zinc-400" />Move all to entity</span>
        <span className="text-zinc-500 text-xs">&#9654;</span>
      </button>
      <button onClick={(e) => { e.stopPropagation(); setStep('add_cat') }} className={`${row} justify-between`} disabled={working}>
        <span className="flex items-center gap-2"><Tag className="w-3.5 h-3.5 text-zinc-400" />Add category to all</span>
        <span className="text-zinc-500 text-xs">&#9654;</span>
      </button>
      <button onClick={(e) => { e.stopPropagation(); setStep('rm_cat') }} className={`${row} justify-between`} disabled={working}>
        <span className="flex items-center gap-2"><Tag className="w-3.5 h-3.5 text-zinc-400" />Remove category from all</span>
        <span className="text-zinc-500 text-xs">&#9654;</span>
      </button>
      <div className="border-t border-zinc-700 my-1" />
      <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true) }} className={`${row} text-red-400`} disabled={working}>
        <Trash2 className="w-3.5 h-3.5 shrink-0" />Delete {selectedIds.length} video{selectedIds.length !== 1 ? 's' : ''}
      </button>
      <div className="border-t border-zinc-700 my-1" />
      <button onClick={(e) => { e.stopPropagation(); onClearSelection(); onClose() }} className={`${row} text-zinc-400`}>
        <X className="w-3.5 h-3.5 shrink-0" />Clear selection
      </button>
    </div>
  )
}

// ── VideoGrid ─────────────────────────────────────────────────────────────────

type SortField = 'file_created_at' | 'file_modified_at' | 'created_at' | 'file_size' | 'duration' | 'rating' | 'file_name'
type SortDir = 'asc' | 'desc'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'file_created_at', label: 'Date Created' },
  { value: 'file_modified_at', label: 'Date Modified' },
  { value: 'created_at', label: 'Date Added' },
  { value: 'file_size', label: 'File Size' },
  { value: 'duration', label: 'Duration' },
  { value: 'rating', label: 'Rating' },
  { value: 'file_name', label: 'Name' },
]

function sortVideos(videos: Video[], field: SortField, dir: SortDir): Video[] {
  const sorted = [...videos].sort((a, b) => {
    let av: string | number | null, bv: string | number | null
    if (field === 'file_name') {
      av = a.file_name.toLowerCase()
      bv = b.file_name.toLowerCase()
    } else {
      av = a[field] ?? null
      bv = b[field] ?? null
    }
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (av < bv) return -1
    if (av > bv) return 1
    return 0
  })
  return dir === 'desc' ? sorted.reverse() : sorted
}

export function VideoGrid() {
  const {
    videos, selectedEntityId, entities, addToQueue, setVideos, openPlayer,
    categories, selectedCategoryIds, searchQuery,
  } = useStore()
  const selectedEntity = entities.find((e) => e.id === selectedEntityId)

  // Sort & filter
  const [sortField, setSortField] = useState<SortField>('file_created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [minRating, setMinRating] = useState(0) // 0 = no filter
  const filteredVideos = minRating > 0 ? videos.filter((v) => v.rating >= minRating) : videos
  const sortedVideos = sortVideos(filteredVideos, sortField, sortDir)

  // Single-video context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; video: Video } | null>(null)
  // Bulk context menu
  const [bulkMenu, setBulkMenu] = useState<{ x: number; y: number } | null>(null)
  // Multi-selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)

  // Close menus on outside click
  useEffect(() => {
    if (!ctxMenu && !bulkMenu && !showSortMenu) return
    const close = () => { setCtxMenu(null); setBulkMenu(null); setShowSortMenu(false) }
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close) }
  }, [ctxMenu, bulkMenu, showSortMenu])

  // Cmd+A to select all
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && sortedVideos.length > 0) {
        e.preventDefault()
        setSelectedIds(new Set(sortedVideos.map((v) => v.id)))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sortedVideos])

  // Clear selection when view changes
  useEffect(() => { setSelectedIds(new Set()); setLastSelectedIndex(null) }, [selectedEntityId, selectedCategoryIds, searchQuery])

  // Reload videos when filters change (skip if search is active)
  useEffect(() => {
    if (searchQuery) return
    if (!selectedEntityId && selectedCategoryIds.length === 0) { setVideos([]); return }
    invoke<Video[]>('get_videos_filtered', {
      entityId: selectedEntityId ?? null,
      categoryIds: selectedCategoryIds,
    }).then(setVideos).catch(() => {})
  }, [selectedEntityId, selectedCategoryIds, searchQuery])

  const reloadVideos = async () => {
    invoke<Video[]>('get_videos_filtered', {
      entityId: selectedEntityId ?? null,
      categoryIds: selectedCategoryIds,
    }).then(setVideos).catch(() => {})
  }

  const handleVideoClick = (e: React.MouseEvent, video: Video, index: number) => {
    e.stopPropagation() // prevent click bubbling to the empty-space deselect handler
    setCtxMenu(null)
    setBulkMenu(null)
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault()
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.has(video.id) ? next.delete(video.id) : next.add(video.id)
        return next
      })
      setLastSelectedIndex(index)
    } else if (e.shiftKey && lastSelectedIndex !== null) {
      e.preventDefault()
      const lo = Math.min(lastSelectedIndex, index)
      const hi = Math.max(lastSelectedIndex, index)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        videos.slice(lo, hi + 1).forEach((v) => next.add(v.id))
        return next
      })
    } else if (selectedIds.size > 0) {
      setSelectedIds(new Set())
      setLastSelectedIndex(null)
      openPlayer(videos, index)
    } else {
      setLastSelectedIndex(index)
      openPlayer(videos, index)
    }
  }

  const handleVideoContextMenu = (e: React.MouseEvent, video: Video) => {
    e.preventDefault()
    e.stopPropagation()
    if (selectedIds.size > 1 && selectedIds.has(video.id)) {
      // Right-click on a selected video when multiple selected → bulk menu
      setBulkMenu({ x: e.clientX, y: e.clientY })
    } else {
      // Clear selection, show single-video menu
      setSelectedIds(new Set())
      setCtxMenu({ x: e.clientX, y: e.clientY, video })
    }
  }

  if (!searchQuery && !selectedEntityId && selectedCategoryIds.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-700 bg-zinc-900">
        <div className="text-center space-y-2">
          <Film className="w-12 h-12 mx-auto" />
          <p className="text-sm">Select an entity or category to view videos</p>
        </div>
      </div>
    )
  }

  const activeCategories = categories.filter((c) => selectedCategoryIds.includes(c.id))
  const headerLabel = searchQuery
    ? `Search: "${searchQuery}"`
    : selectedEntity
      ? selectedEntity.name
      : activeCategories.map((c) => c.name).join(', ')

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-900">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center gap-3 shrink-0">
        <span className="font-medium text-zinc-100">{headerLabel}</span>
        {selectedCategoryIds.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded">
            <Tag className="w-2.5 h-2.5" />
            {selectedCategoryIds.length === 1 ? activeCategories[0]?.name : `${selectedCategoryIds.length} categories`}
          </span>
        )}
        {selectedIds.size > 0 && (
          <span className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-blue-400 font-medium">{selectedIds.size} selected</span>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              clear
            </button>
          </span>
        )}
        {selectedIds.size === 0 && (
          <span className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-zinc-500">{filteredVideos.length} video{filteredVideos.length !== 1 ? 's' : ''}</span>
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSortMenu((v) => !v) }}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded transition-colors"
              >
                {SORT_OPTIONS.find((o) => o.value === sortField)?.label}
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
              {showSortMenu && (
                <div className="absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl py-1 z-50 text-xs w-36">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={(e) => { e.stopPropagation(); setSortField(opt.value); setShowSortMenu(false) }}
                      className={`w-full px-3 py-1.5 text-left hover:bg-zinc-700 transition-colors ${
                        sortField === opt.value ? 'text-blue-400' : 'text-zinc-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setSortDir((d) => d === 'desc' ? 'asc' : 'desc')}
              title={sortDir === 'desc' ? 'Descending (high → low)' : 'Ascending (low → high)'}
              className="p-0.5 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {sortDir === 'desc'
                ? <ArrowDownAZ className="w-3.5 h-3.5" />
                : <ArrowUpAZ className="w-3.5 h-3.5" />}
            </button>
            <span className="border-l border-zinc-700 h-4" />
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={(e) => { e.stopPropagation(); setMinRating(minRating === star ? 0 : star) }}
                  title={minRating === star ? 'Clear rating filter' : `Show ${star}+ stars`}
                  className={`transition-colors ${star <= minRating ? 'text-yellow-400' : 'text-zinc-700 hover:text-zinc-500'}`}
                >
                  <Star className="w-3 h-3" fill={star <= minRating ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
          </span>
        )}
      </div>

      {videos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-zinc-700">
          <div className="text-center space-y-2">
            <Film className="w-10 h-10 mx-auto" />
            <p className="text-sm">No videos match this filter</p>
            <p className="text-xs text-zinc-600">Try a different entity or category</p>
          </div>
        </div>
      ) : (
        <div
          className="flex-1 overflow-y-auto p-4"
          onClick={() => { if (selectedIds.size > 0) setSelectedIds(new Set()) }}
        >
          <p className="text-[10px] text-zinc-600 mb-3">
            ⌘A select all · ⌘ click to select · shift click for range · right-click for bulk actions
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {sortedVideos.map((video, index) => {
              const isSelected = selectedIds.has(video.id)
              return (
                <div key={video.id}
                  draggable
                  onDragStart={(e) => {
                    const ids = selectedIds.has(video.id) && selectedIds.size > 0
                      ? Array.from(selectedIds)
                      : [video.id]
                    e.dataTransfer.setData('text/plain', `dio-videos:${JSON.stringify(ids)}`)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={(e) => handleVideoClick(e, video, index)}
                  onContextMenu={(e) => handleVideoContextMenu(e, video)}
                  className={`group relative bg-zinc-800 rounded-lg overflow-hidden cursor-pointer transition-all ${
                    isSelected
                      ? 'ring-2 ring-blue-500'
                      : 'hover:ring-2 hover:ring-blue-500/50'
                  }`}
                >
                  {/* Selection badge */}
                  {isSelected && (
                    <div className="absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}

                  <div className="aspect-video bg-zinc-700 flex items-center justify-center overflow-hidden">
                    {video.thumbnail_path
                      ? <ThumbnailImg path={video.thumbnail_path} alt={video.file_name} />
                      : <Film className="w-8 h-8 text-zinc-600" />}
                  </div>

                  <div className="p-2">
                    <p className="text-xs text-zinc-300 truncate leading-snug">{video.file_name}</p>
                    <div className="flex items-center justify-between mt-1">
                      {video.duration != null
                        ? <span className="text-[10px] text-zinc-500">{formatDuration(video.duration)}</span>
                        : <span />}
                      <StarRating videoId={video.id} rating={video.rating} onUpdate={reloadVideos} />
                    </div>
                  </div>

                  {/* Add to queue (only when not in selection mode) */}
                  {selectedIds.size === 0 && (
                    <button onClick={(e) => { e.stopPropagation(); addToQueue(video) }}
                      title="Add to play tray"
                      className="absolute top-1.5 right-1.5 p-1 bg-zinc-900/80 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-600 text-zinc-300 hover:text-white"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} video={ctxMenu.video}
          onClose={() => setCtxMenu(null)} onRefresh={reloadVideos} />
      )}
      {bulkMenu && (
        <BulkContextMenu
          x={bulkMenu.x} y={bulkMenu.y}
          selectedIds={Array.from(selectedIds)}
          onClose={() => setBulkMenu(null)}
          onRefresh={reloadVideos}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}
    </div>
  )
}
