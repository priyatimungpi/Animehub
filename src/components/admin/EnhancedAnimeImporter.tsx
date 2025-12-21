import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AnimeImporterService } from '../../services/anime/importer'
import Button from '../base/Button'
import Input from '../base/Input'
import LoadingSpinner from '../base/LoadingSpinner'
import Card from '../base/Card'
import { TrailerDebugger } from './TrailerDebugger'
import { supabase } from '../../lib/database/supabase'

interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  errors: string[]
  duplicates: string[]
}

interface SearchResult {
  title: string
  title_japanese?: string
  year?: number
  status?: string
  type?: string
  genres?: string[]
  rating?: number
  poster_url?: string
  description?: string
  source: 'jikan' | 'anilist'
  originalData: any
}

interface ImportProgress {
  total: number
  completed: number
  current: string
  percentage: number
}

interface EnhancedAnimeImporterProps {
  onImportComplete?: () => void
}

export const EnhancedAnimeImporter: React.FC<EnhancedAnimeImporterProps> = ({ onImportComplete }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedAnime, setSelectedAnime] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [source, setSource] = useState<'jikan' | 'anilist'>('jikan')
  const [showPreview, setShowPreview] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [searchFilters, setSearchFilters] = useState({
    year: '',
    genre: '',
    status: '',
    rating: '',
    sortBy: 'relevance'
  })
  const [batchSize, setBatchSize] = useState(5)
  const [autoImport, setAutoImport] = useState(false)
  const [importHistory, setImportHistory] = useState<any[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [activeTab, setActiveTab] = useState<'search' | 'trending' | 'seasonal' | 'debug'>('search')
  const [message, setMessage] = useState<string | null>(null)

  // Debounce search query
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')

  // Debounce search query with 300ms delay
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery])

  // Load import history on component mount
  useEffect(() => {
    loadImportHistory()
  }, [])

  const loadImportHistory = async () => {
    try {
      const history = JSON.parse(localStorage.getItem('animeImportHistory') || '[]')
      setImportHistory(history)
    } catch (error) {
      console.error('Failed to load import history:', error)
    }
  }

  const saveImportHistory = (result: ImportResult, query: string) => {
    const historyItem = {
      id: Date.now(),
      query,
      result,
      timestamp: new Date().toISOString(),
      source
    }
    
    const newHistory = [historyItem, ...importHistory.slice(0, 9)]
    setImportHistory(newHistory)
    localStorage.setItem('animeImportHistory', JSON.stringify(newHistory))
  }

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return

    setIsSearching(true)
    setSearchResults([])
    setImportResult(null)

    try {
      let results: any[] = []
      
      if (source === 'jikan') {
        results = await AnimeImporterService.searchJikanAnime(query, 25)
      } else {
        results = await AnimeImporterService.searchAniListAnime(query, 50)
      }

      const mappedResults: SearchResult[] = results.map(anime => {
        const mapped = source === 'jikan' 
          ? AnimeImporterService.mapJikanToDatabase(anime)
          : AnimeImporterService.mapAniListToDatabase(anime)
        
        return {
          ...mapped,
          source,
          originalData: anime
        } as SearchResult
      })

      const filteredResults = applyFiltersToResults(mappedResults)
      setSearchResults(filteredResults)
    } catch (error) {
      console.error('Search error:', error)
      alert(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSearching(false)
    }
  }, [source])

  // Auto-search when debounced query changes
  useEffect(() => {
    if (debouncedSearchQuery.trim() && activeTab === 'search') {
      handleSearch(debouncedSearchQuery)
    }
  }, [debouncedSearchQuery, activeTab, handleSearch])

  const applyFiltersToResults = (results: SearchResult[]): SearchResult[] => {
    let filteredResults = results
    
    if (searchFilters.year) {
      filteredResults = filteredResults.filter(anime => 
        anime.year === parseInt(searchFilters.year) || 
        anime.originalData.startDate?.year === parseInt(searchFilters.year)
      )
    }
    
    if (searchFilters.genre) {
      filteredResults = filteredResults.filter(anime => 
        anime.genres?.some((g: string) => 
          g.toLowerCase().includes(searchFilters.genre.toLowerCase())
        )
      )
    }
    
    if (searchFilters.status) {
      filteredResults = filteredResults.filter(anime => 
        anime.status?.toLowerCase().includes(searchFilters.status.toLowerCase())
      )
    }
    
    if (searchFilters.rating) {
      const minRating = parseFloat(searchFilters.rating)
      filteredResults = filteredResults.filter(anime => 
        (anime.rating || anime.originalData.score || anime.originalData.averageScore) >= minRating
      )
    }

    filteredResults.sort((a, b) => {
      switch (searchFilters.sortBy) {
        case 'rating':
          return (b.rating || b.originalData.score || b.originalData.averageScore || 0) - 
                 (a.rating || a.originalData.score || a.originalData.averageScore || 0)
        case 'year':
          return (b.year || b.originalData.startDate?.year || 0) - 
                 (a.year || a.originalData.startDate?.year || 0)
        case 'title':
          return (a.title || '').localeCompare(b.title || '')
        case 'popularity':
          return (b.originalData.popularity || b.originalData.members || 0) - 
                 (a.originalData.popularity || a.originalData.members || 0)
        default:
          return 0
      }
    })

    return filteredResults
  }

  const handleSelectAnime = (anime: SearchResult) => {
    setSelectedAnime(prev => {
      const isSelected = prev.some(selected => 
        selected.title === anime.title && selected.source === anime.source
      )
      
      if (isSelected) {
        return prev.filter(selected => 
          !(selected.title === anime.title && selected.source === anime.source)
        )
      } else {
        return [...prev, anime]
      }
    })
  }

  const handleBulkImport = async () => {
    if (selectedAnime.length === 0) {
      alert('Please select at least one anime to import')
      return
    }

    setIsImporting(true)
    setImportResult(null)
    setImportProgress({
      total: selectedAnime.length,
      completed: 0,
      current: '',
      percentage: 0
    })

    try {
      const results: ImportResult = {
        success: true,
        imported: 0,
        skipped: 0,
        errors: [],
        duplicates: []
      }

      // Use state batchSize instead of hardcoded value
      const currentBatchSize = batchSize || 3
      for (let i = 0; i < selectedAnime.length; i += currentBatchSize) {
        const batch = selectedAnime.slice(i, i + currentBatchSize)
        
        const batchPromises = batch.map(async (anime, batchIndex) => {
          try {
            const mappedData = anime.source === 'jikan' 
              ? AnimeImporterService.mapJikanToDatabase(anime.originalData)
              : AnimeImporterService.mapAniListToDatabase(anime.originalData)

            const imported = anime.source === 'anilist' 
              ? await AnimeImporterService.importAnimeFromAniList(anime.originalData)
              : await AnimeImporterService.importAnime(mappedData)
            return {
              success: !!imported,
              title: anime.title,
              isDuplicate: !imported
            }
          } catch (error) {
            return {
              success: false,
              title: anime.title,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          }
        })

        // Use Promise.allSettled for better error handling
        const batchResults = await Promise.allSettled(batchPromises)
        
        batchResults.forEach((settledResult, batchIndex) => {
          // Handle Promise.allSettled results
          const result = settledResult.status === 'fulfilled' 
            ? settledResult.value 
            : {
                success: false,
                title: batch[batchIndex]?.title || 'Unknown',
                error: settledResult.reason?.message || 'Unknown error'
              }

          setImportProgress(prev => prev ? {
            ...prev,
            current: result.title,
            completed: prev.completed + 1,
            percentage: Math.round(((prev.completed + 1) / prev.total) * 100)
          } : null)

          if (result.success) {
            results.imported++
          } else if (result.isDuplicate) {
            results.skipped++
            results.duplicates.push(result.title)
          } else {
            results.errors.push(`${result.title}: ${result.error}`)
          }
        })

        if (i + currentBatchSize < selectedAnime.length) {
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }

      setImportResult(results)
      saveImportHistory(results, searchQuery)
      setSelectedAnime([])
      setSearchResults([])
      
      // Call callback to refresh parent component
      if (results.imported > 0 && onImportComplete) {
        onImportComplete()
      }
    } catch (error) {
      console.error('Import error:', error)
      alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsImporting(false)
      setImportProgress(null)
    }
  }

  const handleQuickImport = async (anime: SearchResult) => {
    setIsImporting(true)
    setImportResult(null)

    try {
      const mappedData = anime.source === 'jikan' 
        ? AnimeImporterService.mapJikanToDatabase(anime.originalData)
        : AnimeImporterService.mapAniListToDatabase(anime.originalData)

      const imported = anime.source === 'anilist' 
        ? await AnimeImporterService.importAnimeFromAniList(anime.originalData)
        : await AnimeImporterService.importAnime(mappedData)
      
      if (imported) {
        const result = {
          success: true,
          imported: 1,
          skipped: 0,
          errors: [],
          duplicates: []
        }
        
        setImportResult(result)
        saveImportHistory(result, anime.title)
        
        setSearchResults(prev => prev.filter(result => 
          !(result.title === anime.title && result.source === anime.source)
        ))
        
        // Call callback to refresh parent component
        if (onImportComplete) {
          onImportComplete()
        }
      } else {
        setImportResult({
          success: false,
          imported: 0,
          skipped: 1,
          errors: [],
          duplicates: [anime.title]
        })
      }
    } catch (error) {
      setImportResult({
        success: false,
        imported: 0,
        skipped: 0,
        errors: [`${anime.title}: ${error instanceof Error ? error.message : 'Unknown error'}`],
        duplicates: []
      })
    } finally {
      setIsImporting(false)
    }
  }

  const handleTrendingImport = async () => {
    setIsSearching(true)
    setSearchResults([])
    setImportResult(null)

    try {
      let mappedResults: SearchResult[]
      
      if (source === 'anilist') {
        const results = await AnimeImporterService.getTrendingAniListAnime(25)
        mappedResults = results.map(anime => ({
          ...AnimeImporterService.mapAniListToDatabase(anime),
          source: 'anilist' as const,
          originalData: anime
        }))
      } else {
        const results = await AnimeImporterService.getTrendingJikanAnime(25)
        mappedResults = results.map(anime => ({
          ...AnimeImporterService.mapJikanToDatabase(anime),
          source: 'jikan' as const,
          originalData: anime
        }))
      }

      const filteredResults = applyFiltersToResults(mappedResults)
      setSearchResults(filteredResults)
    } catch (error) {
      console.error('Trending import error:', error)
      alert(`Failed to fetch trending anime: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSearching(false)
    }
  }

  const handleSeasonalImport = async () => {
    const currentDate = new Date()
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1
    
    let season = 'winter'
    if (month >= 3 && month <= 5) season = 'spring'
    else if (month >= 6 && month <= 8) season = 'summer'
    else if (month >= 9 && month <= 11) season = 'fall'

    setIsSearching(true)
    setSearchResults([])
    setImportResult(null)

    try {
      let mappedResults: SearchResult[]
      
      if (source === 'anilist') {
        const results = await AnimeImporterService.getSeasonalAniListAnime(year, season, 25)
        mappedResults = results.map(anime => ({
          ...AnimeImporterService.mapAniListToDatabase(anime),
          source: 'anilist' as const,
          originalData: anime
        }))
      } else {
        const results = await AnimeImporterService.getSeasonalJikanAnime(year, season, 25)
        mappedResults = results.map(anime => ({
          ...AnimeImporterService.mapJikanToDatabase(anime),
          source: 'jikan' as const,
          originalData: anime
        }))
      }

      const filteredResults = applyFiltersToResults(mappedResults)
      setSearchResults(filteredResults)
    } catch (error) {
      console.error('Seasonal import error:', error)
      alert(`Failed to fetch seasonal anime: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelectAll = () => {
    if (selectedAnime.length === searchResults.length) {
      setSelectedAnime([])
    } else {
      setSelectedAnime([...searchResults])
    }
  }

  const handleClearFilters = () => {
    setSearchFilters({
      year: '',
      genre: '',
      status: '',
      rating: '',
      sortBy: 'relevance'
    })
  }

  const handleApplyFilters = async () => {
    if (!searchQuery.trim()) {
      await handleTrendingImport()
      return
    }
    await handleSearch()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-4">
            🎌 Anime Import Hub
          </h1>
          <p className="text-gray-600 text-lg">
            Discover, import, and manage your anime collection with advanced features
          </p>
        </motion.div>

        {/* Main Import Interface */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/20 overflow-hidden"
        >
          {/* Tab Navigation */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6">
            <div className="flex space-x-1 bg-white/20 rounded-2xl p-1">
              {[
                { id: 'search', label: '🔍 Search Anime', icon: '🔍' },
                { id: 'trending', label: '🔥 Trending', icon: '🔥' },
                { id: 'seasonal', label: '🌸 Seasonal', icon: '🌸' },
                { id: 'debug', label: '🧪 Debug', icon: '🧪' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-white text-purple-600 shadow-lg'
                      : 'text-white hover:bg-white/10'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-8">
            <AnimatePresence mode="wait">
              {activeTab === 'search' && (
                <motion.div
                  key="search"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  {/* Search Controls */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-200">
                    <div className="flex flex-col lg:flex-row gap-4">
                      <div className="flex-1">
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          🎯 Search Query
                        </label>
                        <Input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search for anime (e.g., Attack on Titan, Demon Slayer)"
                          onKeyPress={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
                          className="w-full px-4 py-3 rounded-xl border-2 border-blue-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-200 transition-all"
                        />
                      </div>
                      
                      <div className="lg:w-48">
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          📡 Data Source
                        </label>
                        <select
                          value={source}
                          onChange={(e) => setSource(e.target.value as 'jikan' | 'anilist')}
                          className="w-full px-4 py-3 rounded-xl border-2 border-blue-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-200 transition-all"
                        >
                          <option value="jikan">Jikan (MyAnimeList)</option>
                          <option value="anilist">AniList</option>
                        </select>
                      </div>
                      
                      <div className="lg:w-32 flex items-end">
                        <Button
                          onClick={() => handleSearch(searchQuery)}
                          disabled={isSearching || !searchQuery.trim()}
                          className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                        >
                          {isSearching ? (
                            <div className="flex items-center justify-center">
                              <LoadingSpinner size="sm" />
                              <span className="ml-2">Searching...</span>
                            </div>
                          ) : (
                            '🔍 Search'
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'trending' && (
                <motion.div
                  key="trending"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <div className="text-center">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4">🔥 Trending Anime</h3>
                    <p className="text-gray-600 mb-6">Discover the most popular anime right now</p>
                    <Button
                      onClick={handleTrendingImport}
                      disabled={isSearching}
                      className="px-8 py-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                    >
                      {isSearching ? (
                        <div className="flex items-center">
                          <LoadingSpinner size="sm" />
                          <span className="ml-2">Loading...</span>
                        </div>
                      ) : (
                        '🔥 Load Trending Anime'
                      )}
                    </Button>
                  </div>
                </motion.div>
              )}

              {activeTab === 'seasonal' && (
                <motion.div
                  key="seasonal"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <div className="text-center">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4">🌸 Current Season</h3>
                    <p className="text-gray-600 mb-6">Explore anime from the current season</p>
                    <Button
                      onClick={handleSeasonalImport}
                      disabled={isSearching}
                      className="px-8 py-4 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                    >
                      {isSearching ? (
                        <div className="flex items-center">
                          <LoadingSpinner size="sm" />
                          <span className="ml-2">Loading...</span>
                        </div>
                      ) : (
                        '🌸 Load Current Season'
                      )}
                    </Button>
                  </div>
                </motion.div>
              )}

              {activeTab === 'debug' && (
                <motion.div
                  key="debug"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <TrailerDebugger />
                  
                  {/* Characters Debug Section */}
                  <Card className="p-6">
                    <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                      🎭 Characters Debug
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Test character import and check database status.
                    </p>
                    
                    {/* Message Display */}
                    {message && (
                      <div className={`p-4 rounded-xl mb-4 ${
                        message.includes('Error') || message.includes('error')
                          ? 'bg-red-50 border border-red-200 text-red-700' 
                          : 'bg-green-50 border border-green-200 text-green-700'
                      }`}>
                        <p className="font-medium">{message}</p>
                      </div>
                    )}
                    
                    <div className="flex gap-4">
                      <Button
                        onClick={async () => {
                          try {
                            const { data, error } = await supabase
                              .from('anime_characters')
                              .select('*')
                              .limit(5)
                            
                            if (error) {
                              console.error('Error checking characters table:', error)
                              setMessage(`Characters table error: ${error.message}`)
                            } else {
                              console.log('Characters table data:', data)
                              setMessage(`Characters table OK. Found ${data?.length || 0} characters.`)
                            }
                          } catch (err) {
                            console.error('Error:', err)
                            setMessage(`Error: ${err}`)
                          }
                        }}
                        className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white px-4 py-2 rounded-xl font-semibold transition-all duration-300"
                      >
                        🔍 Check Characters Table
                      </Button>
                      
                      <Button
                        onClick={async () => {
                          try {
                            const { data, error } = await supabase
                              .from('anime')
                              .select('id, title')
                              .limit(1)
                            
                            if (error) {
                              console.error('Error checking anime table:', error)
                              setMessage(`Anime table error: ${error.message}`)
                            } else if (data && data.length > 0) {
                              const animeId = data[0].id
                              const { data: characters, error: charError } = await supabase
                                .from('anime_characters')
                                .select('*')
                                .eq('anime_id', animeId)
                              
                              if (charError) {
                                console.error('Error fetching characters:', charError)
                                setMessage(`Error fetching characters: ${charError.message}`)
                              } else {
                                console.log(`Characters for ${data[0].title}:`, characters)
                                setMessage(`Found ${characters?.length || 0} characters for "${data[0].title}"`)
                              }
                            } else {
                              setMessage('No anime found in database')
                            }
                          } catch (err) {
                            console.error('Error:', err)
                            setMessage(`Error: ${err}`)
                          }
                        }}
                        className="bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white px-4 py-2 rounded-xl font-semibold transition-all duration-300"
                      >
                        👥 Check Sample Characters
                      </Button>
                      
                      <Button
                        onClick={async () => {
                          try {
                            setMessage('Testing AniList character fetch...')
                            
                            // Test AniList API directly
                            const testQuery = `
                              query {
                                Media(search: "Attack on Titan", type: ANIME) {
                                  id
                                  title { romaji english native }
                                  characters(sort: [ROLE, RELEVANCE], perPage: 50) {
                                    edges {
                                      id
                                      role
                                      node {
                                        id
                                        name { full native alternative }
                                        image { large medium }
                                        description
                                      }
                                    }
                                  }
                                }
                              }
                            `
                            
                            const response = await fetch('https://graphql.anilist.co', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ query: testQuery })
                            })
                            
                            const data = await response.json()
                            console.log('AniList test response:', data)
                            
                            if (data.data?.Media?.characters?.edges) {
                              const characters = data.data.Media.characters.edges
                              setMessage(`✅ AniList API working! Found ${characters.length} characters for "Attack on Titan"`)
                            } else {
                              setMessage('❌ No characters found in AniList response')
                            }
                          } catch (err) {
                            console.error('AniList test error:', err)
                            setMessage(`❌ AniList API test failed: ${err}`)
                          }
                        }}
                        className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-4 py-2 rounded-xl font-semibold transition-all duration-300"
                      >
                        🧪 Test AniList API
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Advanced Filters */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-8"
            >
              <div className="flex justify-between items-center mb-4">
                <Button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  variant="secondary"
                  className="px-4 py-2 rounded-xl border-2 border-purple-200 hover:border-purple-400 transition-all"
                >
                  {showAdvanced ? '🔽 Hide Advanced' : '🔼 Show Advanced'}
                </Button>
              </div>

              <AnimatePresence>
                {showAdvanced && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-6 border border-purple-200 overflow-hidden"
                  >
                    <h3 className="text-xl font-semibold mb-4 text-gray-800">🔧 Advanced Filters</h3>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
                        <Input
                          type="number"
                          value={searchFilters.year}
                          onChange={(e) => setSearchFilters({...searchFilters, year: e.target.value})}
                          placeholder="2023"
                          className="rounded-xl border-2 border-purple-200 focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Genre</label>
                        <Input
                          type="text"
                          value={searchFilters.genre}
                          onChange={(e) => setSearchFilters({...searchFilters, genre: e.target.value})}
                          placeholder="Action"
                          className="rounded-xl border-2 border-purple-200 focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                        <select
                          value={searchFilters.status}
                          onChange={(e) => setSearchFilters({...searchFilters, status: e.target.value})}
                          className="w-full px-3 py-2 rounded-xl border-2 border-purple-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                        >
                          <option value="">All</option>
                          <option value="ongoing">Ongoing</option>
                          <option value="completed">Completed</option>
                          <option value="upcoming">Upcoming</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Min Rating</label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          max="10"
                          value={searchFilters.rating}
                          onChange={(e) => setSearchFilters({...searchFilters, rating: e.target.value})}
                          placeholder="8.0"
                          className="rounded-xl border-2 border-purple-200 focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
                        <select
                          value={searchFilters.sortBy}
                          onChange={(e) => setSearchFilters({...searchFilters, sortBy: e.target.value})}
                          className="w-full px-3 py-2 rounded-xl border-2 border-purple-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                        >
                          <option value="relevance">Relevance</option>
                          <option value="rating">Rating</option>
                          <option value="year">Year</option>
                          <option value="title">Title</option>
                          <option value="popularity">Popularity</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-6">
                      <Button
                        onClick={handleClearFilters}
                        variant="secondary"
                        className="px-4 py-2 rounded-xl"
                      >
                        🗑️ Clear Filters
                      </Button>
                      <Button
                        onClick={handleApplyFilters}
                        disabled={isSearching}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl"
                      >
                        🔍 Apply Filters
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Import Settings */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-8"
            >
              <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-6 border border-green-200">
                <h3 className="text-xl font-semibold mb-4 text-gray-800">⚙️ Import Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Batch Size</label>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={batchSize}
                      onChange={(e) => setBatchSize(parseInt(e.target.value) || 5)}
                      className="rounded-xl border-2 border-green-200 focus:border-green-500"
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoImport}
                        onChange={(e) => setAutoImport(e.target.checked)}
                        className="w-5 h-5 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                      />
                      <span className="ml-3 text-sm font-medium text-gray-700">Auto Import</span>
                    </label>
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showPreview}
                        onChange={(e) => setShowPreview(e.target.checked)}
                        className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      />
                      <span className="ml-3 text-sm font-medium text-gray-700">Show Preview</span>
                    </label>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Import Progress */}
            <AnimatePresence>
              {importProgress && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="mt-8"
                >
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-200">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800">📊 Import Progress</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between text-sm font-medium">
                        <span>Progress: {importProgress.completed}/{importProgress.total}</span>
                        <span>{importProgress.percentage}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <motion.div 
                          className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${importProgress.percentage}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <div className="text-sm text-gray-600">
                        Currently importing: <span className="font-semibold text-purple-600">{importProgress.current}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Import Results */}
            <AnimatePresence>
              {importResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="mt-8"
                >
                  <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-6 border border-green-200">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800">📈 Import Results</h3>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="text-center p-4 bg-green-100 rounded-xl">
                        <div className="text-2xl font-bold text-green-600">{importResult.imported}</div>
                        <div className="text-sm text-green-700">Imported</div>
                      </div>
                      <div className="text-center p-4 bg-yellow-100 rounded-xl">
                        <div className="text-2xl font-bold text-yellow-600">{importResult.skipped}</div>
                        <div className="text-sm text-yellow-700">Skipped</div>
                      </div>
                      <div className="text-center p-4 bg-red-100 rounded-xl">
                        <div className="text-2xl font-bold text-red-600">{importResult.errors.length}</div>
                        <div className="text-sm text-red-700">Errors</div>
                      </div>
                    </div>
                    
                    {importResult.duplicates.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">Duplicates found:</p>
                        <div className="flex flex-wrap gap-2">
                          {importResult.duplicates.map((title, index) => (
                            <span key={index} className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                              {title}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {importResult.errors.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">Errors:</p>
                        <div className="space-y-1">
                          {importResult.errors.map((error, index) => (
                            <div key={index} className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">
                              • {error}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Search Results */}
        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-8"
            >
              <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-2xl font-bold text-white">
                      📋 Search Results ({searchResults.length})
                    </h3>
                    <div className="flex gap-3">
                      <Button
                        onClick={handleSelectAll}
                        variant="secondary"
                        className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                      >
                        {selectedAnime.length === searchResults.length ? '❌ Deselect All' : '✅ Select All'}
                      </Button>
                      <Button
                        onClick={() => setShowPreview(!showPreview)}
                        variant="secondary"
                        className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                      >
                        {showPreview ? '👁️ Hide Preview' : '👁️ Show Preview'}
                      </Button>
                      {selectedAnime.length > 0 && (
                        <Button
                          onClick={handleBulkImport}
                          disabled={isImporting}
                          className="bg-white text-purple-600 hover:bg-gray-50 font-semibold px-6 py-2 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
                        >
                          {isImporting ? (
                            <div className="flex items-center">
                              <LoadingSpinner size="sm" />
                              <span className="ml-2">Importing...</span>
                            </div>
                          ) : (
                            `📥 Import Selected (${selectedAnime.length})`
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {searchResults.map((anime, index) => {
                      const isSelected = selectedAnime.some(selected => 
                        selected.title === anime.title && selected.source === anime.source
                      )
                      
                      return (
                        <motion.div
                          key={`${anime.title}-${anime.source}-${index}`}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="group"
                        >
                          <div className={`relative bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border-2 ${
                            isSelected ? 'border-purple-500 shadow-purple-200' : 'border-gray-200 hover:border-purple-300'
                          } overflow-hidden`}>
                            {anime.poster_url && (
                              <div className="relative h-48 overflow-hidden">
                                <img
                                  src={anime.poster_url}
                                  alt={anime.title}
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                  width={300}
                                  height={192}
                                  loading="lazy"
                                  decoding="async"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none'
                                  }}
                                />
                                <div className="absolute top-2 right-2 bg-black/50 text-white px-2 py-1 rounded-lg text-xs">
                                  {anime.source.toUpperCase()}
                                </div>
                                {isSelected && (
                                  <div className="absolute top-2 left-2 bg-purple-500 text-white p-2 rounded-full">
                                    ✓
                                  </div>
                                )}
                              </div>
                            )}
                            
                            <div className="p-4">
                              <h4 className="font-bold text-lg mb-2 line-clamp-2 group-hover:text-purple-600 transition-colors">
                                {anime.title}
                              </h4>
                              {anime.title_japanese && (
                                <p className="text-sm text-gray-500 mb-2 line-clamp-1">{anime.title_japanese}</p>
                              )}
                              <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                                <div className="flex items-center space-x-2">
                                  {anime.year && <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full">{anime.year}</span>}
                                  {anime.type && <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full">{anime.type}</span>}
                                </div>
                                {anime.rating && (
                                  <div className="flex items-center text-yellow-600">
                                    <span className="text-xs">⭐</span>
                                    <span className="font-semibold ml-1">{anime.rating}/10</span>
                                  </div>
                                )}
                              </div>
                              {anime.genres && anime.genres.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-4">
                                  {anime.genres.slice(0, 3).map((genre, idx) => (
                                    <span key={idx} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                                      {genre}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="flex gap-2">
                                <Button
                                  onClick={() => handleSelectAnime(anime)}
                                  className={`flex-1 px-3 py-2 rounded-xl font-medium transition-all ${
                                    isSelected 
                                      ? 'bg-purple-500 text-white hover:bg-purple-600' 
                                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                  }`}
                                >
                                  {isSelected ? '✅ Selected' : '📋 Select'}
                                </Button>
                                <Button
                                  onClick={() => handleQuickImport(anime)}
                                  disabled={isImporting}
                                  className="px-3 py-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-xl font-medium transition-all transform hover:scale-105"
                                >
                                  📥
                                </Button>
                              </div>

                              {showPreview && anime.description && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  className="mt-4 pt-4 border-t border-gray-200"
                                >
                                  <p className="text-xs text-gray-600 line-clamp-3">
                                    {anime.description}
                                  </p>
                                </motion.div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Import History */}
        <AnimatePresence>
          {importHistory.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="mt-8"
            >
              <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
                <div className="bg-gradient-to-r from-gray-600 to-gray-800 p-6">
                  <h3 className="text-2xl font-bold text-white">📚 Recent Import History</h3>
                </div>
                <div className="p-8">
                  <div className="space-y-4">
                    {importHistory.slice(0, 5).map((item, index) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex justify-between items-center p-4 bg-gradient-to-r from-gray-50 to-blue-50 rounded-2xl border border-gray-200 hover:shadow-lg transition-all"
                      >
                        <div>
                          <p className="font-semibold text-gray-800">{item.query}</p>
                          <p className="text-sm text-gray-600">
                            {new Date(item.timestamp).toLocaleString()} • {item.source.toUpperCase()}
                          </p>
                        </div>
                        <div className="flex gap-4 text-sm">
                          <span className="flex items-center text-green-600">
                            <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                            ✅ {item.result.imported}
                          </span>
                          <span className="flex items-center text-yellow-600">
                            <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>
                            ⚠️ {item.result.skipped}
                          </span>
                          <span className="flex items-center text-red-600">
                            <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                            ❌ {item.result.errors.length}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}