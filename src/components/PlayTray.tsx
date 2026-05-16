import { DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { invoke } from '@tauri-apps/api/core'
import { BookMarked, GripVertical, ListMusic, Play, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Playlist, Video } from '../types'
import { ConfirmModal } from './ConfirmModal'

function SortableVideo({ video, index, onRemove }: { video: Video; index: number; onRemove: (i: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: String(video.id) })
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 p-2 bg-zinc-700/60 rounded-md group hover:bg-zinc-700 transition-colors"
    >
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-zinc-500 shrink-0">
        <GripVertical className="w-3 h-3" />
      </button>
      <span className="flex-1 text-xs text-zinc-300 truncate min-w-0">{video.file_name}</span>
      <button onClick={() => onRemove(index)}
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 text-zinc-500 transition-all shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

export function PlayTray() {
  const { playQueue, removeFromQueue, reorderQueue, clearQueue, setQueue, openPlayer, addToQueue } = useStore()
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [view, setView] = useState<'queue' | 'save' | 'load'>('queue')
  const [newName, setNewName] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const loadPlaylists = () =>
    invoke<Playlist[]>('get_playlists').then(setPlaylists).catch(() => {})

  useEffect(() => { loadPlaylists() }, [])

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = playQueue.findIndex((v) => String(v.id) === String(active.id))
    const to   = playQueue.findIndex((v) => String(v.id) === String(over.id))
    if (from !== -1 && to !== -1) reorderQueue(from, to)
  }

  const handleSave = async () => {
    if (!newName.trim()) return
    await invoke('save_queue_as_playlist', { name: newName.trim(), videoIds: playQueue.map((v) => v.id) })
    setNewName(''); setView('queue'); loadPlaylists()
  }

  const handleLoad = async (id: number) => {
    const videos = await invoke<Video[]>('get_playlist_videos', { playlistId: id })
    setQueue(videos); setView('queue')
  }

  const [playlistConfirm, setPlaylistConfirm] = useState<{ id: number; name: string } | null>(null)

  const handleDeletePlaylist = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    const pl = playlists.find((p) => p.id === id)
    if (pl) setPlaylistConfirm({ id: pl.id, name: pl.name })
  }

  const executeDeletePlaylist = async () => {
    if (!playlistConfirm) return
    await invoke('delete_playlist', { playlistId: playlistConfirm.id })
    loadPlaylists()
    setPlaylistConfirm(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const raw = e.dataTransfer.getData('text/plain')
    if (!raw?.startsWith('dio-videos:')) return
    try {
      const ids: number[] = JSON.parse(raw.slice('dio-videos:'.length))
      const { videos } = useStore.getState()
      ids.forEach((id) => {
        const v = videos.find((vid) => vid.id === id)
        if (v) addToQueue(v)
      })
    } catch {}
  }

  const dragCounter = useRef(0)

  return (
    <div
      className={`bg-zinc-800 border-l border-zinc-700 flex flex-col h-full transition-colors ${
        dragOver ? 'bg-blue-900/20 border-l-blue-500' : ''
      }`}
      onDragEnter={(e) => {
        e.preventDefault()
        dragCounter.current++
        setDragOver(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        dragCounter.current--
        if (dragCounter.current === 0) setDragOver(false)
      }}
      onDrop={(e) => { dragCounter.current = 0; handleDrop(e) }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700 shrink-0">
        <span className="text-sm font-medium text-zinc-200">Play Tray</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setView(view === 'load' ? 'queue' : 'load')} title="Playlists"
            className={`p-1 rounded hover:bg-zinc-700 transition-colors ${view === 'load' ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          ><ListMusic className="w-3.5 h-3.5" /></button>
          {playQueue.length > 0 && <>
            <button onClick={() => setView(view === 'save' ? 'queue' : 'save')} title="Save as playlist"
              className={`p-1 rounded hover:bg-zinc-700 transition-colors ${view === 'save' ? 'text-blue-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            ><BookMarked className="w-3.5 h-3.5" /></button>
            <button onClick={clearQueue} title="Clear queue"
              className="p-1 hover:bg-zinc-700 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
            ><Trash2 className="w-3.5 h-3.5" /></button>
          </>}
        </div>
      </div>

      {/* Save view */}
      {view === 'save' && (
        <div className="p-3 border-b border-zinc-700 shrink-0 space-y-2">
          <p className="text-xs text-zinc-400">Save queue as playlist</p>
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setView('queue') }}
            placeholder="Playlist name…"
            className="w-full bg-zinc-700 text-xs text-zinc-200 px-2 py-1.5 rounded outline-none placeholder-zinc-500"
          />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!newName.trim()}
              className="flex-1 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded transition-colors"
            >Save</button>
            <button onClick={() => setView('queue')}
              className="px-2 py-1 text-xs hover:bg-zinc-700 rounded text-zinc-400 transition-colors"
            >Cancel</button>
          </div>
        </div>
      )}

      {/* Load view */}
      {view === 'load' && (
        <div className="border-b border-zinc-700 shrink-0 overflow-y-auto max-h-48">
          {playlists.length === 0
            ? <p className="px-3 py-3 text-xs text-zinc-600">No saved playlists</p>
            : playlists.map((pl) => (
              <div key={pl.id} className="flex items-center group">
                <button onClick={() => handleLoad(pl.id)}
                  className="flex-1 px-3 py-2 text-xs text-left text-zinc-300 hover:bg-zinc-700 truncate transition-colors"
                >{pl.name}</button>
                <button onClick={(e) => handleDeletePlaylist(e, pl.id)}
                  className="px-2 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all"
                ><X className="w-3 h-3" /></button>
              </div>
            ))}
        </div>
      )}

      {/* Queue */}
      <div className="flex-1 overflow-y-auto">
        {playQueue.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-600 px-4 text-center">
            <Play className="w-8 h-8" />
            <p className="text-xs">Hover a video and press + to add it here</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={playQueue.map((v) => String(v.id))} strategy={verticalListSortingStrategy}>
              <div className="p-2 space-y-1">
                {playQueue.map((video, index) => (
                  <SortableVideo key={video.id} video={video} index={index} onRemove={removeFromQueue} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {playlistConfirm && (
        <ConfirmModal
          message={`Delete playlist "${playlistConfirm.name}"?`}
          onConfirm={executeDeletePlaylist}
          onCancel={() => setPlaylistConfirm(null)}
        />
      )}
      {playQueue.length > 0 && (
        <div className="border-t border-zinc-700 p-3 space-y-2 shrink-0">
          <p className="text-xs text-zinc-500">{playQueue.length} video{playQueue.length !== 1 ? 's' : ''} queued</p>
          <button
            onClick={() => openPlayer(playQueue, 0)}
            className="w-full flex items-center justify-center gap-2 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
          >
            <Play className="w-3.5 h-3.5" />Play All
          </button>
        </div>
      )}
    </div>
  )
}
