import { create } from 'zustand'
import { Category, DataSource, Entity, Video } from './types'

interface AppStore {
  // Drive
  dataSource: DataSource | null
  setDataSource: (ds: DataSource | null) => void

  // Entities
  entities: Entity[]
  setEntities: (entities: Entity[]) => void
  selectedEntityId: number | null
  setSelectedEntityId: (id: number | null) => void

  // Videos
  videos: Video[]
  setVideos: (videos: Video[]) => void

  // Category filter
  categories: Category[]
  setCategories: (categories: Category[]) => void
  selectedCategoryIds: number[]
  toggleCategoryFilter: (id: number) => void
  clearCategoryFilters: () => void

  // Play queue
  playQueue: Video[]
  addToQueue: (video: Video) => void
  setQueue: (videos: Video[]) => void
  removeFromQueue: (index: number) => void
  reorderQueue: (fromIndex: number, toIndex: number) => void
  clearQueue: () => void

  // In-app player
  playerVideos: Video[] | null
  playerIndex: number
  openPlayer: (videos: Video[], index?: number) => void
  closePlayer: () => void
  setPlayerIndex: (index: number) => void
}

export const useStore = create<AppStore>((set) => ({
  dataSource: null,
  setDataSource: (ds) => set({ dataSource: ds }),

  entities: [],
  setEntities: (entities) => set({ entities }),
  selectedEntityId: null,
  setSelectedEntityId: (id) => set({ selectedEntityId: id, videos: [] }),

  videos: [],
  setVideos: (videos) => set({ videos }),

  categories: [],
  setCategories: (categories) => set({ categories }),
  selectedCategoryIds: [],
  toggleCategoryFilter: (id) =>
    set((s) => ({
      selectedCategoryIds: s.selectedCategoryIds.includes(id)
        ? s.selectedCategoryIds.filter((c) => c !== id)
        : [...s.selectedCategoryIds, id],
    })),
  clearCategoryFilters: () => set({ selectedCategoryIds: [] }),

  playQueue: [],
  // Prevent duplicates so video.id can be used as a stable dnd key
  addToQueue: (video) =>
    set((s) =>
      s.playQueue.some((v) => v.id === video.id)
        ? {}
        : { playQueue: [...s.playQueue, video] }
    ),
  setQueue: (videos) => set({ playQueue: videos }),
  removeFromQueue: (index) =>
    set((s) => ({ playQueue: s.playQueue.filter((_, i) => i !== index) })),
  reorderQueue: (fromIndex, toIndex) =>
    set((s) => {
      const q = [...s.playQueue]
      const [item] = q.splice(fromIndex, 1)
      q.splice(toIndex, 0, item)
      return { playQueue: q }
    }),
  clearQueue: () => set({ playQueue: [] }),

  playerVideos: null,
  playerIndex: 0,
  openPlayer: (videos, index = 0) => set({ playerVideos: videos, playerIndex: index }),
  closePlayer: () => set({ playerVideos: null, playerIndex: 0 }),
  setPlayerIndex: (index) => set({ playerIndex: index }),
}))
