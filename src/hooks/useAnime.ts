import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimeService } from '../services/anime'
import type { Tables } from '../../lib/database/supabase'
import { queryKeys } from './queryKeys'

type Anime = Tables<'anime'>

interface UseAnimeOptions {
  page?: number
  limit?: number
  genre?: string
  year?: number
  status?: string
  search?: string
}

export function useAnime(options: UseAnimeOptions = {}) {
  const params = useMemo(() => ({
    page: options.page || 1,
    limit: options.limit || 20,
    genre: options.genre,
    year: options.year,
    status: options.status,
    search: options.search,
  }), [options.page, options.limit, options.genre, options.year, options.status, options.search])

  const query = useQuery({
    queryKey: queryKeys.anime.list(params),
    queryFn: () => AnimeService.getAnimeList(params.page, params.limit, {
      genre: params.genre,
      year: params.year,
      status: params.status,
      search: params.search,
    }),
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
    refetchOnMount: true, // Always refetch on mount to ensure fresh data
    refetchOnWindowFocus: false,
    keepPreviousData: false, // Don't keep previous data to avoid showing stale empty data
  })

  return {
    anime: query.data?.data ?? [],
    totalPages: query.data?.totalPages ?? 0,
    total: query.data?.total ?? 0,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  }
}

export function useFeaturedAnime(limit: number = 5) {
  const query = useQuery({
    queryKey: queryKeys.anime.featured(limit),
    queryFn: () => AnimeService.getFeaturedAnime(limit),
    staleTime: 10 * 60 * 1000, // 10 minutes (increased)
    gcTime: 30 * 60 * 1000, // 30 minutes (increased)
    retry: 1,
    refetchOnWindowFocus: false,
  })
  return { anime: query.data ?? [], loading: query.isLoading, error: query.error ? (query.error as Error).message : null }
}

export function useTrendingAnime(limit: number = 10) {
  const query = useQuery({
    queryKey: queryKeys.anime.trending(limit),
    queryFn: () => AnimeService.getTrendingAnime(limit),
    staleTime: 5 * 60 * 1000, // 5 minutes (increased from 2)
    gcTime: 20 * 60 * 1000, // 20 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  })
  return { anime: query.data ?? [], loading: query.isLoading, error: query.error ? (query.error as Error).message : null }
}

export function usePopularAnime(limit: number = 12) {
  const query = useQuery({
    queryKey: queryKeys.anime.popular(limit),
    queryFn: () => AnimeService.getPopularAnime(limit),
    staleTime: 5 * 60 * 1000, // 5 minutes (increased from 2)
    gcTime: 20 * 60 * 1000, // 20 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  })
  return { anime: query.data ?? [], loading: query.isLoading, error: query.error ? (query.error as Error).message : null }
}

export function useRecentAnime(limit: number = 6) {
  const query = useQuery({
    queryKey: queryKeys.anime.recent(limit),
    queryFn: () => AnimeService.getRecentAnime(limit),
    staleTime: 2 * 60 * 1000, // 2 minutes (recently added changes often)
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  })
  return { anime: query.data ?? [], loading: query.isLoading, error: query.error ? (query.error as Error).message : null }
}

export function useAnimeById(id: string, userId?: string) {
  const query = useQuery({
    queryKey: queryKeys.anime.byId(id, userId),
    queryFn: () => AnimeService.getAnimeById(id, userId),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })
  return { anime: query.data ?? null, loading: query.isLoading, error: query.error ? (query.error as Error).message : null }
}

export function useSearchAnime(query: string, filters?: {
  genres?: string[]
  year?: string
  status?: string
  sortBy?: string
}) {
  const enabled = !!query && query.length >= 2
  const q = useQuery({
    queryKey: queryKeys.anime.search(query, filters),
    queryFn: () => AnimeService.searchAnime(query, 50, filters),
    enabled,
    staleTime: 3 * 60 * 1000,
    retry: 0,
  })
  return { anime: q.data ?? [], loading: q.isLoading, error: q.error ? (q.error as Error).message : null }
}

export function useGenres() {
  const q = useQuery({
    queryKey: queryKeys.anime.genres(),
    queryFn: () => AnimeService.getGenres(),
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 1,
  })
  return { genres: q.data ?? [], loading: q.isLoading, error: q.error ? (q.error as Error).message : null }
}

export function useSimilarAnime(animeId: string, genres: string[], limit: number = 6) {
  const memoGenres = useMemo(() => genres, [genres.join(',')])
  const q = useQuery({
    queryKey: queryKeys.anime.similar(animeId, memoGenres, limit),
    queryFn: () => AnimeService.getSimilarAnime(animeId, memoGenres, limit),
    enabled: !!animeId && memoGenres.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
  return { anime: q.data ?? [], loading: q.isLoading, error: q.error ? (q.error as Error).message : null }
}