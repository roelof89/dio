import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { Copy, HardDrive, RefreshCw, ScanLine } from 'lucide-react'
import { Sidebar } from './components/Sidebar'
import { VideoGrid } from './components/VideoGrid'
import { PlayTray } from './components/PlayTray'
import { Player } from './components/Player'
import { DuplicateReview } from './components/DuplicateReview'
import { useStore } from './store'
import { Category, DataSource, Entity, Video } from './types'

function App() {
  const { dataSource, setDataSource, setEntities, setCategories } = useStore()
  const [scanStatus, setScanStatus] = useState<string | null>(null)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [leftWidth, setLeftWidth] = useState(240)
  const [rightWidth, setRightWidth] = useState(240)

  const startDrag = (side: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = side === 'left' ? leftWidth : rightWidth
    const set = side === 'left' ? setLeftWidth : setRightWidth
    const sign = side === 'left' ? 1 : -1
    const onMove = (ev: MouseEvent) =>
      set(Math.max(160, Math.min(520, startW + sign * (ev.clientX - startX))))
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const loadEntities = async () => {
    const entities = await invoke<Entity[]>('get_entities')
    setEntities(entities)
    const cats = await invoke<Category[]>('get_categories')
    setCategories(cats)
  }

  // Re-run discovery then reload (used by the Discover button)
  const handleDiscover = async () => {
    await invoke('discover')
    await loadEntities()
  }

  const handleScanAll = async () => {
    setScanStatus('Starting scan…')
    try {
      const count = await invoke<number>('scan_all')
      setScanStatus(`Scan complete — ${count} new video${count !== 1 ? 's' : ''} added`)
      setTimeout(() => setScanStatus(null), 4000)
      // Reload the video list if an entity is currently selected
      const { selectedEntityId, setVideos } = useStore.getState()
      if (selectedEntityId !== null) {
        const videos = await invoke<Video[]>('get_videos', { entityId: selectedEntityId })
        setVideos(videos)
      }
    } catch (e) {
      setScanStatus(`Scan error: ${e}`)
      setTimeout(() => setScanStatus(null), 6000)
    }
  }

  useEffect(() => {
    const unlisten = listen<{ file_name: string; count: number }>('scan_progress', (e) => {
      setScanStatus(`Scanning… ${e.payload.file_name} (${e.payload.count})`)
    })
    return () => { unlisten.then((fn) => fn()) }
  }, [])

  useEffect(() => {
    // Auto-connect to last drive if still available
    invoke<string | null>('get_last_drive_path').then(async (path) => {
      if (!path) return
      try {
        const ds = await invoke<DataSource>('connect_drive', { path })
        setDataSource(ds)
        await loadEntities()
      } catch {
        // Drive no longer mounted; wait for manual connect
      }
    })
  }, [])

  const handleConnect = async () => {
    const selected = await open({ directory: true, multiple: false })
    if (!selected) return
    const path = typeof selected === 'string' ? selected : selected[0]
    const ds = await invoke<DataSource>('connect_drive', { path })
    setDataSource(ds)
    await loadEntities()
  }

  const handleDisconnect = async () => {
    await invoke('disconnect_drive')
    setDataSource(null)
    setEntities([])
    setCategories([])
  }

  if (!dataSource) {
    return (
      <div className="h-screen bg-zinc-900 flex items-center justify-center text-zinc-100">
        <div className="text-center space-y-4">
          <HardDrive className="w-14 h-14 mx-auto text-zinc-600" />
          <h1 className="text-2xl font-semibold tracking-tight">Dio</h1>
          <p className="text-zinc-500 text-sm">Connect an external drive to get started</p>
          <button
            onClick={handleConnect}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
          >
            Connect Drive
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-zinc-900 text-zinc-100 flex flex-col select-none">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border-b border-zinc-700 shrink-0">
        <HardDrive className="w-4 h-4 text-zinc-400 shrink-0" />
        <span className="text-sm font-medium">{dataSource.name}</span>
        <span className="text-xs text-zinc-600 truncate hidden sm:block">{dataSource.path}</span>
        {scanStatus && (
          <span className="text-xs text-zinc-400 truncate max-w-xs">{scanStatus}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setShowDuplicates(true)}
            title="Check for duplicate videos"
            className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleScanAll}
            title="Scan all entities for new videos"
            className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ScanLine className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDiscover}
            title="Discover new entity folders"
            className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDisconnect}
            className="px-2.5 py-1 text-xs hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Three-pane layout */}
      <div className="flex flex-1 overflow-hidden">
        <div style={{ width: leftWidth, minWidth: leftWidth }} className="flex flex-col overflow-hidden shrink-0">
          <Sidebar />
        </div>
        {/* Left drag handle */}
        <div
          onMouseDown={startDrag('left')}
          className="w-1 shrink-0 cursor-col-resize bg-zinc-700 hover:bg-blue-500 active:bg-blue-400 transition-colors"
        />
        <VideoGrid />
        {/* Right drag handle */}
        <div
          onMouseDown={startDrag('right')}
          className="w-1 shrink-0 cursor-col-resize bg-zinc-700 hover:bg-blue-500 active:bg-blue-400 transition-colors"
        />
        <div style={{ width: rightWidth, minWidth: rightWidth }} className="flex flex-col overflow-hidden shrink-0">
          <PlayTray />
        </div>
      </div>

      {/* In-app player overlay */}
      <Player />

      {/* Duplicate review overlay */}
      {showDuplicates && (
        <DuplicateReview onClose={async () => {
          setShowDuplicates(false)
          const { selectedEntityId, selectedCategoryIds, setVideos } = useStore.getState()
          if (selectedEntityId !== null || selectedCategoryIds.length > 0) {
            const videos = await invoke<Video[]>('get_videos_filtered', {
              entityId: selectedEntityId ?? null,
              categoryIds: selectedCategoryIds,
            })
            setVideos(videos)
          }
        }} />
      )}
    </div>
  )
}

export default App
