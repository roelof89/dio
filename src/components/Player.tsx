import { convertFileSrc } from '@tauri-apps/api/core'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

export function Player() {
  const { playerVideos, playerIndex, closePlayer, setPlayerIndex } = useStore()
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current?.requestFullscreen()
    }
  }

  const video = playerVideos?.[playerIndex]
  const total = playerVideos?.length ?? 0
  const hasPrev = playerIndex > 0
  const hasNext = playerIndex < total - 1

  // Reload and play whenever the current index changes
  useEffect(() => {
    const el = videoRef.current
    if (!el || !video) return
    el.load()
    el.play().catch(() => {})
  }, [playerIndex, video?.file_path])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) closePlayer()
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const el = videoRef.current
        if (el) el.currentTime += e.key === 'ArrowRight' ? 10 : -10
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [playerIndex])

  if (!playerVideos || !video) return null

  const handleEnded = () => {
    if (hasNext) setPlayerIndex(playerIndex + 1)
    else closePlayer()
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-black flex flex-col group/player">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-transparent group-hover/player:bg-zinc-900/80 transition-colors shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-zinc-100 text-sm font-medium truncate">{video.file_name}</p>
          {total > 1 && (
            <p className="text-zinc-500 text-xs">{playerIndex + 1} of {total}</p>
          )}
        </div>
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit full screen (F)' : 'Full screen (F)'}
          className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
        <button
          onClick={closePlayer}
          className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Video */}
      <div className="flex-1 bg-black min-h-0 relative">
        <video
          ref={videoRef}
          src={convertFileSrc(video.file_path)}
          controls
          autoPlay
          className="absolute inset-0 w-full h-full object-contain"
          onEnded={handleEnded}
          style={{ outline: 'none' }}
        />
      </div>

      {/* Prev / Next */}
      {total > 1 && (
        <div className="flex items-center justify-center gap-6 py-3 bg-transparent group-hover/player:bg-zinc-900/80 transition-colors shrink-0">
          <button
            onClick={() => setPlayerIndex(playerIndex - 1)}
            disabled={!hasPrev}
            className="flex items-center gap-1 px-3 py-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-sm"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>

          {/* Queue pills */}
          <div className="flex gap-1.5">
            {playerVideos.map((_, i) => (
              <button
                key={i}
                onClick={() => setPlayerIndex(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === playerIndex ? 'bg-blue-500' : 'bg-zinc-600 hover:bg-zinc-400'
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => setPlayerIndex(playerIndex + 1)}
            disabled={!hasNext}
            className="flex items-center gap-1 px-3 py-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
