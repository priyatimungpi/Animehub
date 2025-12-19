import { supabase, isSupabaseConfigured } from '../../lib/database/supabase'
import type { Tables } from '../../lib/database/supabase'

type Anime = Tables<'anime'>
type Episode = Tables<'episodes'>

export interface CreateAnimeData {
  title: string
  title_japanese?: string
  description?: string
  poster_url?: string
  banner_url?: string
  trailer_url?: string
  rating?: number
  year?: number
  status?: 'ongoing' | 'completed' | 'upcoming'
  type?: 'tv' | 'movie' | 'ova' | 'special'
  genres?: string[]
  studios?: string[]
  total_episodes?: number
  duration?: number
  age_rating?: 'G' | 'PG' | 'PG-13' | 'R' | '18+'
}

export interface CreateEpisodeData {
  anime_id: string
  episode_number: number
  title?: string
  description?: string
  thumbnail_url?: string
  video_url?: string
  duration?: number
  is_premium?: boolean
  air_date?: string
}

export interface AnimeWithEpisodes extends Anime {
  episodes?: Episode[]
  episode_count?: number
}

export class AdminAnimeService {
  // Get all anime with pagination and filters
  static async getAnimeList(page: number = 1, limit: number = 20, filters?: {
    search?: string
    status?: string
    genre?: string
    type?: string
  }) {
    try {
      // First, get the total count without pagination
      let countQuery = supabase
        .from('anime')
        .select('*', { count: 'exact', head: true })

      // Apply filters to count query
      if (filters?.search) {
        countQuery = countQuery.or(`title.ilike.%${filters.search}%,title_japanese.ilike.%${filters.search}%`)
      }
      if (filters?.status && filters.status !== 'all') {
        countQuery = countQuery.eq('status', filters.status)
      }
      if (filters?.type && filters.type !== 'all') {
        countQuery = countQuery.eq('type', filters.type)
      }
      if (filters?.genre && filters.genre !== 'all') {
        countQuery = countQuery.contains('genres', [filters.genre])
      }

      const { count, error: countError } = await countQuery

      if (countError) {
        console.error('Error fetching anime count:', countError)
        return { anime: [], total: 0, error: countError.message }
      }

      // Now get the actual data with pagination
      let dataQuery = supabase
        .from('anime')
        .select(`
          *,
          episodes (id, episode_number, title, duration, is_premium)
        `)
        .order('created_at', { ascending: false })

      // Apply filters to data query
      if (filters?.search) {
        dataQuery = dataQuery.or(`title.ilike.%${filters.search}%,title_japanese.ilike.%${filters.search}%`)
      }
      if (filters?.status && filters.status !== 'all') {
        dataQuery = dataQuery.eq('status', filters.status)
      }
      if (filters?.type && filters.type !== 'all') {
        dataQuery = dataQuery.eq('type', filters.type)
      }
      if (filters?.genre && filters.genre !== 'all') {
        dataQuery = dataQuery.contains('genres', [filters.genre])
      }

      // Apply pagination
      const from = (page - 1) * limit
      const to = from + limit - 1

      const { data, error } = await dataQuery.range(from, to)

      if (error) {
        console.error('Error fetching anime list:', error)
        return { anime: [], total: 0, error: error.message }
      }

      // Transform data to include episode count
      const animeWithCounts = data?.map((anime: any) => ({
        ...anime,
        episode_count: anime.episodes?.length || 0
      })) || []

      return {
        anime: animeWithCounts,
        total: count || 0,
        page,
        totalPages: Math.ceil((count || 0) / limit)
      }
    } catch (err) {
      console.error('Error fetching anime list:', err)
      return { anime: [], total: 0, error: 'Failed to fetch anime list' }
    }
  }

  // Create new anime
  static async createAnime(animeData: CreateAnimeData): Promise<Anime | null> {
    try {
      if (!isSupabaseConfigured) {
        console.error('🚨 Supabase is not configured properly')
        console.error('Please check your .env.local file and ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set correctly')
        throw new Error('Database not configured. Please set up Supabase credentials in .env.local file.')
      }

      console.log('Creating anime with data:', animeData)
      
      const { data, error } = await supabase
        .from('anime')
        .insert(animeData)
        .select()
        .single()

      if (error) {
        console.error('Supabase error creating anime:', error)
        throw new Error(`Database error: ${error.message}`)
      }

      console.log('Anime created successfully:', data)
      return data
    } catch (err) {
      console.error('Error creating anime:', err)
      throw err
    }
  }

  // Update anime
  static async updateAnime(animeId: string, updates: Partial<CreateAnimeData>): Promise<Anime | null> {
    try {
      const { data, error } = await supabase
        .from('anime')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', animeId)
        .select()
        .single()

      if (error) {
        console.error('Error updating anime:', error)
        return null
      }

      return data
    } catch (err) {
      console.error('Error updating anime:', err)
      return null
    }
  }

  // Delete anime
  static async deleteAnime(animeId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('anime')
        .delete()
        .eq('id', animeId)

      if (error) {
        console.error('Error deleting anime:', error)
        return false
      }

      return true
    } catch (err) {
      console.error('Error deleting anime:', err)
      return false
    }
  }

  // Get anime by ID with episodes
  static async getAnimeById(animeId: string): Promise<AnimeWithEpisodes | null> {
    try {
      const { data, error } = await supabase
        .from('anime')
        .select(`
          *,
          episodes (*)
        `)
        .eq('id', animeId)
        .single()

      if (error) {
        console.error('Error fetching anime:', error)
        return null
      }

      // Sort episodes by episode number
      const sortedEpisodes = data.episodes?.sort((a: any, b: any) => 
        a.episode_number - b.episode_number
      ) || []

      return {
        ...data,
        episodes: sortedEpisodes,
        episode_count: sortedEpisodes.length
      }
    } catch (err) {
      console.error('Error fetching anime:', err)
      return null
    }
  }

  // Create episode
  static async createEpisode(episodeData: CreateEpisodeData): Promise<Episode | null> {
    try {
      if (!isSupabaseConfigured) {
        console.error('🚨 Supabase is not configured properly')
        console.error('Please check your .env.local file and ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set correctly')
        throw new Error('Database not configured. Please set up Supabase credentials in .env.local file.')
      }

      console.log('Creating episode with data:', episodeData)
      
      const { data, error } = await supabase
        .from('episodes')
        .insert(episodeData)
        .select()
        .single()

      if (error) {
        console.error('Supabase error creating episode:', error)
        throw new Error(`Database error: ${error.message}`)
      }

      console.log('Episode created successfully:', data)
      return data
    } catch (err) {
      console.error('Error creating episode:', err)
      throw err
    }
  }

  // Update episode
  static async updateEpisode(episodeId: string, updates: Partial<CreateEpisodeData>): Promise<Episode | null> {
    try {
      const { data, error } = await supabase
        .from('episodes')
        .update(updates)
        .eq('id', episodeId)
        .select()
        .single()

      if (error) {
        console.error('Error updating episode:', error)
        return null
      }

      return data
    } catch (err) {
      console.error('Error updating episode:', err)
      return null
    }
  }

  // Delete episode
  static async deleteEpisode(episodeId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('episodes')
        .delete()
        .eq('id', episodeId)

      if (error) {
        console.error('Error deleting episode:', error)
        return false
      }

      return true
    } catch (err) {
      console.error('Error deleting episode:', err)
      return false
    }
  }

  // Bulk delete anime
  static async bulkDeleteAnime(animeIds: string[]): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('anime')
        .delete()
        .in('id', animeIds)

      if (error) {
        console.error('Error bulk deleting anime:', error)
        return false
      }

      return true
    } catch (err) {
      console.error('Error bulk deleting anime:', err)
      return false
    }
  }

  // Get available genres from existing anime
  static async getAvailableGenres(): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('anime')
        .select('genres')
        .not('genres', 'is', null)

      if (error) {
        console.error('Error fetching genres:', error)
        return []
      }

      const allGenres = data.flatMap((anime: any) => anime.genres || [])
      return Array.from(new Set(allGenres)).sort()
    } catch (err) {
      console.error('Error fetching genres:', err)
      return []
    }
  }

  // Get available studios from existing anime
  static async getAvailableStudios(): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('anime')
        .select('studios')
        .not('studios', 'is', null)

      if (error) {
        console.error('Error fetching studios:', error)
        return []
      }

      const allStudios = data.flatMap((anime: any) => anime.studios || [])
      return Array.from(new Set(allStudios)).sort()
    } catch (err) {
      console.error('Error fetching studios:', err)
      return []
    }
  }
}
