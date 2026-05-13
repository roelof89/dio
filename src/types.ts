export interface DataSource {
  id: number
  name: string
  path: string
  created_at: string
}

export interface Entity {
  id: number
  data_source_id: number
  dir_name: string
  name: string
  dir_path: string
  is_unsorted: boolean
  created_at: string
}

export interface Video {
  id: number
  entity_id: number
  file_name: string
  file_path: string
  file_size: number | null
  duration: number | null
  codec: string | null
  file_type: string | null
  fingerprint: string | null
  thumbnail_path: string | null
  rating: number
  file_created_at: string | null
  file_modified_at: string | null
  created_at: string
  processed: boolean
}

export interface Category {
  id: number
  name: string
  description: string | null
  created_at: string
}

export interface DuplicateVideo extends Video {
  entity_name: string
  entity_is_unsorted: boolean
}

export interface DuplicateSet {
  videos: DuplicateVideo[]
  confidence: 'exact' | 'likely' | 'possible'
  suggested_keep_id: number | null
  suggested_action: 'delete_unsorted' | 'link_entities'
}

export interface Playlist {
  id: number
  name: string
  description: string | null
  created_at: string
}
