import { invoke } from '@tauri-apps/api/core'
import { Folder, FolderOpen, Plus, ScanLine, Tag, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Category, Entity, Video } from '../types'
import { useStore } from '../store'
import { ConfirmModal } from './ConfirmModal'

export function Sidebar() {
  const {
    entities, setEntities,
    selectedEntityId, setSelectedEntityId,
    setVideos,
    categories, setCategories,
    selectedCategoryIds, toggleCategoryFilter,
  } = useStore()

  const handleEntityClick = async (id: number) => {
    if (selectedEntityId === id) {
      // Click active entity again → deselect
      setSelectedEntityId(null)
      setVideos([])
    } else {
      setSelectedEntityId(id)
      const videos = await invoke<Video[]>('get_videos', { entityId: id })
      setVideos(videos)
    }
  }

  const handleScanEntity = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    await invoke('scan_entity', { entityId: id })
    const { selectedEntityId, setVideos } = useStore.getState()
    if (selectedEntityId === id) {
      const videos = await invoke<Video[]>('get_videos', { entityId: id })
      setVideos(videos)
    }
  }

  const [newEntityName, setNewEntityName] = useState('')
  const [creatingEntity, setCreatingEntity] = useState(false)

  const handleCreateEntity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEntityName.trim()) return
    await invoke<Entity>('create_entity', { name: newEntityName.trim() })
    const updated = await invoke<Entity[]>('get_entities')
    setEntities(updated)
    setNewEntityName('')
    setCreatingEntity(false)
  }

  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    await invoke<Category>('create_category', { name: newCatName.trim(), description: null })
    const updated = await invoke<Category[]>('get_categories')
    setCategories(updated)
    setNewCatName('')
    setCreatingCat(false)
  }

  const [catConfirm, setCatConfirm] = useState<{ id: number; name: string } | null>(null)

  const handleDeleteCategory = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    const cat = categories.find((c) => c.id === id)
    if (cat) setCatConfirm({ id: cat.id, name: cat.name })
  }

  const executeDeleteCategory = async () => {
    if (!catConfirm) return
    await invoke('delete_category', { categoryId: catConfirm.id })
    const updated = await invoke<Category[]>('get_categories')
    setCategories(updated)
    setCatConfirm(null)
  }

  return (
    <div className="bg-zinc-800 border-r border-zinc-700 flex flex-col overflow-hidden h-full">
      {/* Entity list */}
      <div className="flex-1 min-h-0 overflow-y-auto py-2">
        <div className="flex items-center justify-between px-3 pb-1">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Entities</p>
          <button onClick={() => setCreatingEntity(true)} title="New entity"
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          ><Plus className="w-3 h-3" /></button>
        </div>
        {creatingEntity && (
          <form onSubmit={handleCreateEntity} className="px-3 pb-2">
            <input autoFocus value={newEntityName} onChange={(e) => setNewEntityName(e.target.value)}
              placeholder="Entity name…"
              onKeyDown={(e) => e.key === 'Escape' && setCreatingEntity(false)}
              className="w-full bg-zinc-700 text-zinc-200 text-xs px-2 py-1 rounded outline-none placeholder-zinc-500"
            />
          </form>
        )}

        {entities.length === 0 ? (
          <p className="px-3 py-2 text-xs text-zinc-600">
            No entities yet — connect a drive and discover.
          </p>
        ) : (
          entities.map((entity) => {
            const active = entity.id === selectedEntityId
            return (
              <div
                key={entity.id}
                className={`group flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                  active ? 'bg-blue-600 text-white' : 'text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                <button
                  onClick={() => handleEntityClick(entity.id)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  {active ? (
                    <FolderOpen className="w-4 h-4 shrink-0" />
                  ) : (
                    <Folder className="w-4 h-4 shrink-0 text-zinc-500" />
                  )}
                  <span className="flex-1 truncate">{entity.name}</span>
                  {entity.is_unsorted && (
                    <span className="text-[10px] text-zinc-400 shrink-0">unsorted</span>
                  )}
                </button>
                <button
                  onClick={(e) => handleScanEntity(e, entity.id)}
                  title={`Scan ${entity.name}`}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 shrink-0 transition-opacity"
                >
                  <ScanLine className="w-3 h-3" />
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Category section — max height so it doesn't swallow the entity list */}
      <div className="border-t border-zinc-700 p-3 space-y-1 flex-none overflow-y-auto" style={{ maxHeight: '30%' }}>
        <div className="flex items-center justify-between pb-1">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Categories</p>
          <button onClick={() => setCreatingCat(true)} title="New category"
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          ><Plus className="w-3 h-3" /></button>
        </div>
        {creatingCat && (
          <form onSubmit={handleCreateCategory} className="pb-1">
            <input autoFocus value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Category name…"
              onKeyDown={(e) => e.key === 'Escape' && setCreatingCat(false)}
              className="w-full bg-zinc-700 text-zinc-200 text-xs px-2 py-1 rounded outline-none placeholder-zinc-500"
            />
          </form>
        )}
        {categories.length === 0 && !creatingCat && (
          <p className="text-xs text-zinc-600">No categories yet</p>
        )}
        {categories.map((cat) => {
          const active = selectedCategoryIds.includes(cat.id)
          return (
            <div key={cat.id} className="flex items-center group">
              <button onClick={() => toggleCategoryFilter(cat.id)}
                className={`flex items-center gap-2 flex-1 min-w-0 px-2 py-1 rounded text-xs transition-colors ${
                  active ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                }`}
              >
                <Tag className="w-3 h-3 shrink-0" />
                <span className="truncate">{cat.name}</span>
              </button>
              <button onClick={(e) => handleDeleteCategory(e, cat.id)}
                className="hidden group-hover:block p-0.5 text-zinc-500 hover:text-red-400 transition-colors shrink-0"
              ><Trash2 className="w-3 h-3" /></button>
            </div>
          )
        })}
      </div>
      {catConfirm && (
        <ConfirmModal
          message={`Delete category "${catConfirm.name}"?\n\nThis will remove it from all tagged videos.`}
          onConfirm={executeDeleteCategory}
          onCancel={() => setCatConfirm(null)}
        />
      )}
    </div>
  )
}
