import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { AdminService } from '../../../services/admin';
import { AnimeService } from '../../../services/anime';
import AddAnimeModal from '../../../components/admin/AddAnimeModal';
import AddEpisodeModal from '../../../components/admin/AddEpisodeModal';
import ConfirmationDialog from '../../../components/admin/ConfirmationDialog';
import EditAnimeModal from '../../../components/admin/EditAnimeModal';
import EditEpisodeModal from '../../../components/admin/EditEpisodeModal';
import { EnhancedAnimeImporter } from '../../../components/admin/EnhancedAnimeImporter';
import { AnimeScraperComponent } from '../../../components/admin/AnimeScraperComponent';
import { ScrapedEpisodesModal } from '../../../components/admin/ScrapedEpisodesModal';
import LargeAnimeScraper from '../../../components/admin/LargeAnimeScraper';

export default function AnimeManagement() {
  const queryClient = useQueryClient();
  const [anime, setAnime] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalAnime, setTotalAnime] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterGenre, setFilterGenre] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAnime, setSelectedAnime] = useState<Set<string>>(new Set());
  const [updatingAnime, setUpdatingAnime] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showAnimeModal, setShowAnimeModal] = useState(false);
  const [selectedAnimeForModal, setSelectedAnimeForModal] = useState<any>(null);
  const [animeAnalytics, setAnimeAnalytics] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [showAddAnimeModal, setShowAddAnimeModal] = useState(false);
  const [showAddEpisodeModal, setShowAddEpisodeModal] = useState(false);
  const [selectedAnimeForEpisode, setSelectedAnimeForEpisode] = useState<any>(null);
  const [animeEpisodes, setAnimeEpisodes] = useState<any[]>([]);
  const [episodesCache, setEpisodesCache] = useState<Record<string, any[]>>({});
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [preloadedAnime, setPreloadedAnime] = useState<Set<string>>(new Set());
  const [preloadQueue, setPreloadQueue] = useState<string[]>([]);
  const [editingEpisode, setEditingEpisode] = useState<string | null>(null);
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
  const [confirmationConfig, setConfirmationConfig] = useState<any>(null);
  const [showEditEpisodeModal, setShowEditEpisodeModal] = useState(false);
  const [selectedEpisodeForEdit, setSelectedEpisodeForEdit] = useState<any>(null);
  const [showEditAnimeModal, setShowEditAnimeModal] = useState(false);
  const [selectedAnimeForEdit, setSelectedAnimeForEdit] = useState<any>(null);
  const [showImporter, setShowImporter] = useState(false);
  const [showScraper, setShowScraper] = useState(false);
  const [showScrapedEpisodesModal, setShowScrapedEpisodesModal] = useState(false);
  const [scrapedEpisodes, setScrapedEpisodes] = useState<any[]>([]);
  const [failedEpisodes, setFailedEpisodes] = useState<any[]>([]);
  const [scrapingSummary, setScrapingSummary] = useState<any>(null);
  const [selectedAnimeForScraping, setSelectedAnimeForScraping] = useState<any>(null);
  const [showLargeScraper, setShowLargeScraper] = useState(false);
  const [selectedAnimeForLargeScraping, setSelectedAnimeForLargeScraping] = useState<any>(null);

  const fetchAnime = async (page: number = 1) => {
    try {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);
      
      const result = await AdminService.getAllAnime(page, 20);
      setAnime(result.anime);
      setTotalAnime(result.total);
      setCurrentPage(page);
      
      // Start preloading episodes for visible anime using queue system
      setTimeout(() => {
        if (result.anime.length > 0) {
          const visibleAnime = result.anime.slice(0, 3);
          const animeToPreload = visibleAnime
            .map(animeItem => animeItem.id)
            .filter(id => !episodesCache[id] && !preloadedAnime.has(id));
          
          // Add to preload queue
          setPreloadQueue(prev => [...prev, ...animeToPreload]);
        }
      }, 300); // Reduced initial delay
      
    } catch (err) {
      console.error('Failed to fetch anime:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch anime');
    } finally {
      setLoading(false);
    }
  };

  // Process preload queue with rate limiting
  useEffect(() => {
    if (preloadQueue.length > 0) {
      const processQueue = async () => {
        const animeId = preloadQueue[0];
        if (animeId && !episodesCache[animeId] && !preloadedAnime.has(animeId)) {
          await preloadEpisodes(animeId);
        }
        
        // Remove processed item and continue
        setPreloadQueue(prev => prev.slice(1));
      };
      
      // Process one item every 300ms
      const timer = setTimeout(processQueue, 300);
      return () => clearTimeout(timer);
    }
  }, [preloadQueue, episodesCache, preloadedAnime]);

  // Debounce search and filter changes to avoid excessive API calls
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [debouncedFilters, setDebouncedFilters] = useState({ status: filterStatus, genre: filterGenre, search: searchTerm });

  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedFilters({ status: filterStatus, genre: filterGenre, search: searchTerm });
    }, 300);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [filterStatus, filterGenre, searchTerm]);

  useEffect(() => {
    fetchAnime();
  }, [debouncedFilters.status, debouncedFilters.genre, debouncedFilters.search]);

  const handleStatusChange = async (animeId: string, newStatus: 'published' | 'pending' | 'draft') => {
    try {
      setUpdatingAnime(animeId);
      setError(null);
      setSuccessMessage(null);
      
      await AdminService.updateAnimeStatus(animeId, newStatus);
      await fetchAnime(currentPage);
      
      setSuccessMessage(`Anime status updated to ${newStatus} successfully!`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to update anime status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update anime status');
    } finally {
      setUpdatingAnime(null);
    }
  };

  const handleDeleteAnime = (animeId: string, animeTitle: string) => {
    setConfirmationConfig({
      title: 'Delete Anime',
      message: `Are you sure you want to delete "${animeTitle}"? This will permanently delete:
      
• All episodes and their data
• All user reviews and ratings
• All user watch progress and favorites
• All content reports
• The anime itself

This action cannot be undone.`,
      confirmText: 'Delete Anime',
      type: 'danger',
      onConfirm: async () => {
        try {
          setUpdatingAnime(animeId);
          setError(null);
          setSuccessMessage(null);
          
          await AdminService.deleteAnime(animeId);
          
          // Invalidate React Query cache for all anime-related queries
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['anime', 'featured'] }),
            queryClient.invalidateQueries({ queryKey: ['anime', 'trending'] }),
            queryClient.invalidateQueries({ queryKey: ['anime', 'popular'] }),
            queryClient.invalidateQueries({ queryKey: ['anime', 'recent'] }),
            queryClient.invalidateQueries({ queryKey: ['anime', 'list'] }),
            queryClient.invalidateQueries({ queryKey: ['anime', 'byId', animeId] }),
          ]);
          
          // Clear local service cache
          AnimeService.clearCache();
          
          await fetchAnime(currentPage);
          
          setSuccessMessage(`Anime "${animeTitle}" deleted successfully!`);
          setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
          console.error('Failed to delete anime:', err);
          setError(err instanceof Error ? err.message : 'Failed to delete anime');
        } finally {
          setUpdatingAnime(null);
          setShowConfirmationDialog(false);
        }
      }
    });
    setShowConfirmationDialog(true);
  };

  const handleBulkAction = async (action: 'published' | 'pending' | 'draft' | 'delete') => {
    const selectedIds = Array.from(selectedAnime);
    
    if (selectedIds.length === 0) return;

    try {
      setUpdatingAnime('bulk');
      setError(null);
      setSuccessMessage(null);

      if (action === 'delete') {
        setConfirmationConfig({
          title: 'Delete Multiple Anime',
          message: `Are you sure you want to delete ${selectedIds.length} anime? This will permanently delete:

• All episodes and their data for each anime
• All user reviews and ratings
• All user watch progress and favorites
• All content reports
• The anime themselves

This action cannot be undone.`,
          confirmText: `Delete ${selectedIds.length} Anime`,
          type: 'danger',
          onConfirm: async () => {
            await AdminService.bulkDeleteAnime(selectedIds);
            
            // Invalidate React Query cache for all anime-related queries
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['anime', 'featured'] }),
              queryClient.invalidateQueries({ queryKey: ['anime', 'trending'] }),
              queryClient.invalidateQueries({ queryKey: ['anime', 'popular'] }),
              queryClient.invalidateQueries({ queryKey: ['anime', 'recent'] }),
              queryClient.invalidateQueries({ queryKey: ['anime', 'list'] }),
            ]);
            
            // Clear local service cache
            AnimeService.clearCache();
            
            setSuccessMessage(`${selectedIds.length} anime deleted successfully!`);
            await fetchAnime(currentPage);
            setSelectedAnime(new Set());
            setShowConfirmationDialog(false);
          }
        });
        setShowConfirmationDialog(true);
        return;
      } else {
        await AdminService.bulkUpdateAnimeStatus(selectedIds, action);
        setSuccessMessage(`${selectedIds.length} anime status updated to ${action}!`);
      }

      await fetchAnime(currentPage);
      setSelectedAnime(new Set());
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to perform bulk action:', err);
      setError(err instanceof Error ? err.message : 'Failed to perform bulk action');
    } finally {
      setUpdatingAnime(null);
    }
  };

  const closeAnimeModal = () => {
    setShowAnimeModal(false);
    setSelectedAnimeForModal(null);
    setAnimeAnalytics(null);
    setAnimeEpisodes([]); // Clear episodes when modal closes
  };

  const handleAnimeCreated = async (_newAnime?: any) => {
    setShowAddAnimeModal(false);
    // Force refresh - go to page 1 since new anime will be there (sorted by created_at desc)
    await fetchAnime(1);
    setCurrentPage(1);
    setSuccessMessage('Anime created successfully!');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleAnimeImported = async () => {
    // Invalidate React Query cache for all anime-related queries
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['anime', 'featured'] }),
      queryClient.invalidateQueries({ queryKey: ['anime', 'trending'] }),
      queryClient.invalidateQueries({ queryKey: ['anime', 'popular'] }),
      queryClient.invalidateQueries({ queryKey: ['anime', 'recent'] }),
      queryClient.invalidateQueries({ queryKey: ['anime', 'list'] }),
    ]);
    AnimeService.clearCache();
    // Refresh the current page
    await fetchAnime(currentPage);
    setSuccessMessage('Anime imported successfully! List refreshed.');
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleEpisodeCreated = async (_newEpisode?: any) => {
    setShowAddEpisodeModal(false);
    setSelectedAnimeForEpisode(null);
    
    // Refresh anime list to update episode counts
    await fetchAnime(currentPage);
    
    // If anime modal is open, refresh its episodes
    if (selectedAnimeForModal) {
      // Clear cache first
      setEpisodesCache(prev => {
        const updated = { ...prev };
        delete updated[selectedAnimeForModal.id];
        return updated;
      });
      // Force reload episodes (bypass cache)
      await fetchAnimeEpisodes(selectedAnimeForModal.id, true);
    }
    
    setSuccessMessage('Episode created successfully!');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleAddEpisode = (anime: any) => {
    setSelectedAnimeForEpisode(anime);
    setShowAddEpisodeModal(true);
  };

  const fetchAnimeEpisodes = async (animeId: string, forceRefresh: boolean = false) => {
    try {
      // Check cache first for instant loading (unless force refresh)
      if (!forceRefresh && episodesCache[animeId]) {
        setAnimeEpisodes(episodesCache[animeId]);
        return;
      }
      
      // Show loading only when fetching from database
      setEpisodesLoading(true);
      
      // Load episodes from database
      const episodes = await AdminService.getAnimeEpisodes(animeId);
      setAnimeEpisodes(episodes);
      
      // Cache the episodes for future use
      setEpisodesCache(prev => ({ ...prev, [animeId]: episodes }));
    } catch (err) {
      console.error('Failed to fetch episodes:', err);
      setError('Failed to fetch episodes');
    } finally {
      setEpisodesLoading(false);
    }
  };

  // Background preloading function (no UI loading state)
  const preloadEpisodes = async (animeId: string) => {
    try {
      // Skip if already cached or currently loading
      if (episodesCache[animeId] || preloadedAnime.has(animeId)) {
        return;
      }

      setPreloadedAnime(prev => new Set(prev).add(animeId));
      
      // Load episodes silently in background with timeout
      const episodesPromise = AdminService.getAnimeEpisodes(animeId);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );
      
      const episodes = await Promise.race([episodesPromise, timeoutPromise]) as any[];
      
      // Cache the episodes for instant future access
      setEpisodesCache(prev => ({ ...prev, [animeId]: episodes }));
      
      console.log(`✅ Preloaded ${episodes.length} episodes for anime ${animeId}`);
    } catch (err) {
      console.error(`Failed to preload episodes for ${animeId}:`, err);
      // Remove from preloaded set on error so it can be retried
      setPreloadedAnime(prev => {
        const newSet = new Set(prev);
        newSet.delete(animeId);
        return newSet;
      });
    }
  };

  const handleDeleteEpisode = (episodeId: string, episodeTitle: string) => {
    setConfirmationConfig({
      title: 'Delete Episode',
      message: `Are you sure you want to delete "${episodeTitle}"? This action cannot be undone and will also delete all associated user progress and reviews.`,
      confirmText: 'Delete Episode',
      type: 'danger',
      onConfirm: async () => {
        try {
          setEditingEpisode(episodeId);
          await AdminService.deleteEpisode(episodeId);
          await fetchAnimeEpisodes(selectedAnimeForModal.id);
          // Clear cache to force refresh
          setEpisodesCache(prev => ({ ...prev, [selectedAnimeForModal.id]: undefined }));
          setSuccessMessage(`Episode "${episodeTitle}" deleted successfully!`);
          setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
          console.error('Failed to delete episode:', err);
          setError('Failed to delete episode');
        } finally {
          setEditingEpisode(null);
          setShowConfirmationDialog(false);
        }
      }
    });
    setShowConfirmationDialog(true);
  };

  const handleEditEpisode = (episode: any) => {
    setSelectedEpisodeForEdit(episode);
    setShowEditEpisodeModal(true);
  };

  const handleEpisodeUpdated = async () => {
    setShowEditEpisodeModal(false);
    setSelectedEpisodeForEdit(null);
    if (selectedAnimeForModal) {
      // Clear cache and force refresh
      setEpisodesCache(prev => {
        const updated = { ...prev };
        delete updated[selectedAnimeForModal.id];
        return updated;
      });
      await fetchAnimeEpisodes(selectedAnimeForModal.id, true); // Force refresh
    }
    // Also refresh anime list to update episode counts
    await fetchAnime(currentPage);
    setSuccessMessage('Episode updated successfully!');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleEditAnime = (anime: any) => {
    setSelectedAnimeForEdit(anime);
    setShowEditAnimeModal(true);
  };

  const handleAnimeUpdated = async () => {
    setShowEditAnimeModal(false);
    setSelectedAnimeForEdit(null);
    // Force refresh anime list
    await fetchAnime(currentPage);
    // If anime modal is open, refresh it too
    if (selectedAnimeForModal) {
      // Clear episodes cache for this anime
      setEpisodesCache(prev => {
        const updated = { ...prev };
        delete updated[selectedAnimeForModal.id];
        return updated;
      });
      // Refresh episodes if modal is open
      await fetchAnimeEpisodes(selectedAnimeForModal.id, true);
    }
    setSuccessMessage('Anime updated successfully!');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleScrapAnime = async (anime: any) => {
    try {
      setError(null);
      setSuccessMessage(null);
      
      console.log(`🎬 Starting scrape for all episodes of "${anime.title}" (ID: ${anime.id})`);
      
      // Import the scraper service
      const { HiAnimeScraperService } = await import('../../../services/scrapers/hianime');
      
      // Scrape all episodes
      const result = await HiAnimeScraperService.scrapeAllEpisodes(anime.title, {
        animeId: anime.id,
        maxEpisodes: anime.total_episodes || 50
      });
      
      if (result.success && result.data) {
        // Set the scraped data
        setScrapedEpisodes(result.data.scrapedEpisodes || []);
        setFailedEpisodes(result.data.failedEpisodes || []);
        setScrapingSummary(result.data.summary || { total: 0, successful: 0, failed: 0, embeddingProtected: 0 });
        setSelectedAnimeForScraping(anime);
        setShowScrapedEpisodesModal(true);
        
        setSuccessMessage(`✅ Scraped ${result.data.summary?.successful || 0} episodes successfully!`);
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setError(`❌ Scraping failed: ${result.error}`);
        setTimeout(() => setError(null), 10000);
      }
    } catch (error: any) {
      console.error('Scraping error:', error);
      setError(`❌ Error: ${error.message}`);
      setTimeout(() => setError(null), 10000);
    }
  };

  const handleLargeScrape = (anime: any) => {
    setSelectedAnimeForLargeScraping(anime);
    setShowLargeScraper(true);
  };

  const handleCloseLargeScraper = async () => {
    setShowLargeScraper(false);
    setSelectedAnimeForLargeScraping(null);
    // Refresh the anime list to show updated episode count
    await fetchAnime(currentPage);
    // If anime modal is open, refresh its episodes too
    if (selectedAnimeForModal) {
      setEpisodesCache(prev => {
        const updated = { ...prev };
        delete updated[selectedAnimeForModal.id];
        return updated;
      });
      await fetchAnimeEpisodes(selectedAnimeForModal.id, true);
    }
  };

  const handleCloseScrapedEpisodesModal = async () => {
    setShowScrapedEpisodesModal(false);
    setScrapedEpisodes([]);
    setFailedEpisodes([]);
    setScrapingSummary(null);
    setSelectedAnimeForScraping(null);
    // Refresh the anime list to show updated episode count
    await fetchAnime(currentPage);
    // If anime modal is open, refresh its episodes too
    if (selectedAnimeForModal) {
      setEpisodesCache(prev => {
        const updated = { ...prev };
        delete updated[selectedAnimeForModal.id];
        return updated;
      });
      await fetchAnimeEpisodes(selectedAnimeForModal.id, true);
    }
  };

  const handleViewAnimeDetails = async (anime: any) => {
    setSelectedAnimeForModal(anime);
    setShowAnimeModal(true);
    
    // Use preloaded episodes if available, otherwise clear episodes
    if (episodesCache[anime.id]) {
      setAnimeEpisodes(episodesCache[anime.id]);
    } else {
      setAnimeEpisodes([]);
    }
    
    setAnalyticsLoading(true);
    
    try {
      // Fetch detailed analytics
      const analytics = await AdminService.getAnimeAnalytics(anime.id);
      setAnimeAnalytics(analytics);
      
      // Only fetch episodes if not already cached
      if (!episodesCache[anime.id]) {
        fetchAnimeEpisodes(anime.id);
      }
    } catch (err) {
      console.error('Failed to fetch anime analytics:', err);
      setError('Failed to fetch anime details');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const filteredAnime = anime.filter(item => {
    const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
    const matchesGenre = filterGenre === 'all' || 
      (item.genres && item.genres.some((genre: string) => genre.toLowerCase().includes(filterGenre.toLowerCase())));
    const matchesSearch = searchTerm === '' || 
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesStatus && matchesGenre && matchesSearch;
  });

  const totalPages = Math.ceil(totalAnime / 20);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-green-100 text-green-800 border-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'draft': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'published': return '✅';
      case 'pending': return '⏳';
      case 'draft': return '📝';
      default: return '📄';
    }
  };

  const getGenreIcon = (genre: string) => {
    switch (genre.toLowerCase()) {
      case 'action': return '⚔️';
      case 'romance': return '💕';
      case 'comedy': return '😂';
      case 'drama': return '🎭';
      case 'fantasy': return '🧙‍♂️';
      case 'sci-fi': return '🚀';
      case 'horror': return '👻';
      case 'slice of life': return '🌸';
      default: return '🎬';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section - Anime Themed */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border-2 border-indigo-200 p-6">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                    <span className="text-2xl">🎬</span>
                  </div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    Anime Management
                  </h1>
                </div>
                <p className="text-gray-600 ml-13">Manage your anime content library with power and precision</p>
              </div>
              
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setShowAddAnimeModal(true)}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl hover:from-indigo-700 hover:to-indigo-800 transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <span className="text-lg">➕</span>
                  <span className="font-medium">Add Anime</span>
                </button>
                <button
                  onClick={() => setShowImporter(true)}
                  className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <span className="text-lg">📥</span>
                  <span className="font-medium">Import</span>
                </button>
                <button
                  onClick={() => setShowScraper(true)}
                  className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <span className="text-lg">🔍</span>
                  <span className="font-medium">Scraper</span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Cards - Anime Themed */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white/80 backdrop-blur-sm rounded-xl shadow-md p-5 border-l-4 border-indigo-500 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Total Anime</p>
                <p className="text-3xl font-bold text-indigo-600">{totalAnime}</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-xl flex items-center justify-center">
                <span className="text-2xl">🎬</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-white/80 backdrop-blur-sm rounded-xl shadow-md p-5 border-l-4 border-green-500 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Published</p>
                <p className="text-3xl font-bold text-green-600">
                  {anime.filter(a => a.status === 'published').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-green-100 to-green-200 rounded-xl flex items-center justify-center">
                <span className="text-2xl">✅</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-white/80 backdrop-blur-sm rounded-xl shadow-md p-5 border-l-4 border-yellow-500 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Ongoing</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {anime.filter(a => a.status === 'pending').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-yellow-100 to-yellow-200 rounded-xl flex items-center justify-center">
                <span className="text-2xl">⏳</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-white/80 backdrop-blur-sm rounded-xl shadow-md p-5 border-l-4 border-purple-500 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Selected</p>
                <p className="text-3xl font-bold text-purple-600">{selectedAnime.size}</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-purple-200 rounded-xl flex items-center justify-center">
                <span className="text-2xl">📝</span>
              </div>
            </div>
          </motion.div>
        </div>


        {error && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl shadow-md"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">❌</span>
              <span className="text-red-700 font-medium">{error}</span>
            </div>
          </motion.div>
        )}
        
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-4 bg-green-50 border-l-4 border-green-500 p-4 rounded-r-xl shadow-md"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <span className="text-green-700 font-medium">{successMessage}</span>
            </div>
          </motion.div>
        )}

        {/* Preloading Status */}
        {Object.keys(episodesCache).length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-4 rounded-r-xl shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-blue-400 border-t-blue-600 rounded-full animate-spin"></div>
              <span className="text-blue-700 font-medium">
                ⚡ Preloaded episodes for {Object.keys(episodesCache).length} anime - Click "View Details" for instant loading!
              </span>
            </div>
          </motion.div>
        )}

        {/* Filters and Search - Anime Themed */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border-2 border-purple-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="text-xl">🔎</span>
            <h2 className="text-lg font-semibold text-gray-800">Search & Filters</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="md:col-span-2">
              <label htmlFor="search" className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <span>🔍</span> Search Anime
              </label>
              <input
                type="text"
                id="search"
                className="w-full px-4 py-2.5 bg-white border-2 border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                placeholder="Search by title..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Status Filter */}
            <div>
              <label htmlFor="statusFilter" className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <span>📊</span> Status
              </label>
              <select
                id="statusFilter"
                className="w-full px-4 py-2.5 bg-white border-2 border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="published">✅ Published</option>
                <option value="pending">⏳ Ongoing</option>
                <option value="draft">📝 Draft</option>
              </select>
              </div>

            {/* Genre Filter */}
            <div>
              <label htmlFor="genreFilter" className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <span>🎭</span> Genre
              </label>
              <select
                id="genreFilter"
                className="w-full px-4 py-2.5 bg-white border-2 border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                value={filterGenre}
                onChange={(e) => setFilterGenre(e.target.value)}
              >
                <option value="all">All Genres</option>
                <option value="action">⚔️ Action</option>
                <option value="romance">💕 Romance</option>
                <option value="comedy">😂 Comedy</option>
                <option value="drama">🎭 Drama</option>
                <option value="fantasy">✨ Fantasy</option>
                <option value="sci-fi">🚀 Sci-Fi</option>
                <option value="horror">👻 Horror</option>
                <option value="slice of life">🌸 Slice of Life</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bulk Actions - Redesigned */}
        {selectedAnime.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-300 rounded-2xl p-5 mb-6 shadow-lg"
          >
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold">{selectedAnime.size}</span>
                </div>
                <span className="text-indigo-900 font-semibold">anime selected</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleBulkAction('published')}
                  disabled={updatingAnime === 'bulk'}
                  className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-sm font-medium"
                >
                  {updatingAnime === 'bulk' ? '⏳ Updating...' : '✅ Publish'}
                </button>
                <button
                  onClick={() => handleBulkAction('pending')}
                  disabled={updatingAnime === 'bulk'}
                  className="px-4 py-2 bg-gradient-to-r from-yellow-600 to-orange-600 text-white rounded-xl hover:from-yellow-700 hover:to-orange-700 disabled:opacity-50 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-sm font-medium"
                >
                  {updatingAnime === 'bulk' ? '⏳ Updating...' : '⏳ Pending'}
                </button>
                <button
                  onClick={() => handleBulkAction('draft')}
                  disabled={updatingAnime === 'bulk'}
                  className="px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl hover:from-gray-700 hover:to-gray-800 disabled:opacity-50 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-sm font-medium"
                >
                  {updatingAnime === 'bulk' ? '⏳ Updating...' : '📝 Draft'}
                </button>
                <button
                  onClick={() => handleBulkAction('delete')}
                  disabled={updatingAnime === 'bulk'}
                  className="px-4 py-2 bg-gradient-to-r from-red-600 to-pink-600 text-white rounded-xl hover:from-red-700 hover:to-pink-700 disabled:opacity-50 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-sm font-medium"
                >
                  {updatingAnime === 'bulk' ? '⏳ Deleting...' : '🗑️ Delete'}
                </button>
                <button
                  onClick={() => setSelectedAnime(new Set())}
                  className="px-4 py-2 bg-white border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all shadow-md text-sm font-medium"
                >
                  ✕ Clear
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Select All Header - Redesigned */}
        {!loading && filteredAnime.length > 0 && (
          <div className="bg-white/70 backdrop-blur-sm border-2 border-purple-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={selectedAnime.size === filteredAnime.length && filteredAnime.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      // Select all visible anime
                      const allIds = new Set(filteredAnime.map(item => item.id));
                      setSelectedAnime(allIds);
                    } else {
                      // Deselect all
                      setSelectedAnime(new Set());
                    }
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Select All ({filteredAnime.length} anime)
                </span>
              </div>
              <div className="text-sm text-gray-500">
                {selectedAnime.size > 0 && `${selectedAnime.size} selected`}
              </div>
            </div>
          </div>
        )}

        {/* Anime List - Completely Redesigned */}
        {loading ? (
          <div className="flex flex-col justify-center items-center h-64">
            <div className="w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-600 font-medium">Loading anime...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5">
            {filteredAnime.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="group relative bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden hover:border-purple-300 hover:shadow-2xl transition-all duration-300"
              >
                {/* Selection Checkbox - Top Right Corner */}
                <div className="absolute top-4 left-4 z-10">
                  <input
                    type="checkbox"
                    checked={selectedAnime.has(item.id)}
                    onChange={(e) => {
                      const newSelected = new Set(selectedAnime);
                      if (e.target.checked) {
                        newSelected.add(item.id);
                      } else {
                        newSelected.delete(item.id);
                      }
                      setSelectedAnime(newSelected);
                    }}
                    className="w-5 h-5 rounded-md border-2 border-white text-purple-600 focus:ring-2 focus:ring-purple-500 shadow-lg cursor-pointer"
                  />
                </div>

                <div className="flex flex-col lg:flex-row gap-6 p-6">
                  {/* Poster - Enhanced */}
                  <div className="flex-shrink-0">
                    <div className="relative group/poster">
                      <img
                        className="h-56 w-40 rounded-xl object-cover shadow-xl border-2 border-purple-200 group-hover:scale-105 transition-transform duration-300"
                        src={item.poster_url || item.thumbnail || '/placeholder-anime.jpg'}
                        alt={item.title}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = 'https://via.placeholder.com/160x224/6366f1/ffffff?text=Anime';
                        }}
                      />
                      {episodesCache[item.id] && (
                        <div className="absolute -top-2 -right-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                          ⚡ {episodesCache[item.id].length}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 flex flex-col justify-between">
                    {/* Title & Status */}
                    <div>
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <h3 className="text-2xl font-bold text-gray-900 group-hover:text-purple-600 transition-colors line-clamp-2">
                          {item.title}
                        </h3>
                        <span className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border-2 ${getStatusColor(item.status)} shadow-sm`}>
                          {getStatusIcon(item.status)} {item.status.toUpperCase()}
                        </span>
                      </div>

                      <p className="text-gray-600 text-sm mb-4 line-clamp-2 leading-relaxed">
                        {item.description || 'No description available'}
                      </p>
                      
                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        <div className="flex items-center gap-2 bg-indigo-50 px-3 py-2 rounded-lg">
                          <span className="text-xl">🎬</span>
                          <div>
                            <p className="text-xs text-gray-500">Episodes</p>
                            <p className="font-bold text-indigo-600">{item.episode_count || 0}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 bg-yellow-50 px-3 py-2 rounded-lg">
                          <span className="text-xl">⭐</span>
                          <div>
                            <p className="text-xs text-gray-500">Rating</p>
                            <p className="font-bold text-yellow-600">{item.average_rating || 'N/A'}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 bg-purple-50 px-3 py-2 rounded-lg">
                          <span className="text-xl">👀</span>
                          <div>
                            <p className="text-xs text-gray-500">Views</p>
                            <p className="font-bold text-purple-600">{item.views?.toLocaleString() || '0'}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 bg-pink-50 px-3 py-2 rounded-lg">
                          <span className="text-xl">📅</span>
                          <div>
                            <p className="text-xs text-gray-500">Added</p>
                            <p className="font-bold text-pink-600 text-xs">{new Date(item.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </div>

                      {/* Genres */}
                      {item.genres && item.genres.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {item.genres.slice(0, 5).map((genre: string, index: number) => (
                            <span key={index} className="px-3 py-1 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 rounded-full text-xs font-semibold border border-purple-200">
                              {getGenreIcon(genre)} {genre}
                            </span>
                          ))}
                          {item.genres.length > 5 && (
                            <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">
                              +{item.genres.length - 5} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-3 pt-4 border-t-2 border-gray-100">
                      {/* Status Selector */}
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-semibold text-gray-700">Status:</label>
                        <select
                          value={item.status}
                          onChange={(e) => handleStatusChange(item.id, e.target.value as any)}
                          disabled={updatingAnime === item.id}
                          className="flex-1 px-3 py-2 bg-white border-2 border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50 transition-all"
                        >
                          <option value="published">✅ Published</option>
                          <option value="pending">⏳ Pending</option>
                          <option value="draft">📝 Draft</option>
                        </select>
                        {updatingAnime === item.id && (
                          <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                        )}
                      </div>

                      {/* Action Buttons Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        <button 
                          onClick={() => handleViewAnimeDetails(item)}
                          className="px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all text-xs font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-1"
                        >
                          <span>👁️</span> Details
                        </button>
                        <button
                          onClick={() => handleEditAnime(item)}
                          className="px-3 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all text-xs font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-1"
                        >
                          <span>✏️</span> Edit
                        </button>
                        <button
                          onClick={() => handleAddEpisode(item)}
                          className="px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all text-xs font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-1"
                        >
                          <span>➕</span> Episode
                        </button>
                        <button
                          onClick={() => handleScrapAnime(item)}
                          className="px-3 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-xl hover:from-orange-700 hover:to-red-700 transition-all text-xs font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-1"
                        >
                          <span>🔍</span> Scrape
                        </button>
                        <button
                          onClick={() => handleLargeScrape(item)}
                          className="px-3 py-2 bg-gradient-to-r from-pink-600 to-rose-600 text-white rounded-xl hover:from-pink-700 hover:to-rose-700 transition-all text-xs font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-1"
                        >
                          <span>🚀</span> Bulk
                        </button>
                        <button
                          onClick={() => handleDeleteAnime(item.id, item.title)}
                          disabled={updatingAnime === item.id}
                          className="px-3 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-700 hover:to-red-800 disabled:opacity-50 transition-all text-xs font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-1"
                        >
                          {updatingAnime === item.id ? '⏳' : '🗑️'} Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
            
            {filteredAnime.length === 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="col-span-full"
              >
                <div className="bg-gradient-to-br from-purple-50/50 via-pink-50/50 to-indigo-50/50 backdrop-blur-sm border-2 border-dashed border-purple-300/50 rounded-3xl p-16 text-center">
                  <motion.div
                    animate={{ 
                      scale: [1, 1.1, 1],
                      rotate: [0, 5, -5, 0]
                    }}
                    transition={{ 
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="text-9xl mb-6 inline-block"
                  >
                    🎬
                  </motion.div>
                  
                  <h3 className="text-3xl font-bold mb-3">
                    <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 bg-clip-text text-transparent">
                      No Anime Found
                    </span>
                  </h3>
                  
                  <p className="text-gray-600 text-lg mb-8 max-w-md mx-auto">
                    {searchTerm || filterStatus !== 'all' || filterGenre !== 'all'
                      ? 'No anime match your current filters. Try adjusting your search criteria.'
                      : 'Your anime library is empty. Start by adding or importing anime.'
                  }
                  </p>
                  
                  {!searchTerm && filterStatus === 'all' && filterGenre === 'all' && (
                    <div className="flex gap-4 justify-center">
                      <button
                        onClick={() => setShowAddAnimeModal(true)}
                        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
                      >
                        ➕ Add Anime
                      </button>
                      <button
                        onClick={() => setShowImporter(true)}
                        className="px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
                      >
                        📥 Import Anime
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center mt-8"
          >
            <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-2xl p-2 shadow-lg border border-purple-200/50">
              <button
                onClick={() => fetchAnime(currentPage - 1)}
                disabled={currentPage === 1 || loading}
                className="px-4 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl font-medium hover:shadow-lg hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
              >
                <span>←</span>
                <span className="hidden sm:inline">Previous</span>
              </button>
              
              <div className="flex items-center gap-1.5 px-2">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNumber => {
                  // Show first, last, current, and adjacent pages
                  const showPage = 
                    pageNumber === 1 || 
                    pageNumber === totalPages || 
                    Math.abs(pageNumber - currentPage) <= 1;
                  
                  const showEllipsis = 
                    (pageNumber === currentPage - 2 && currentPage > 3) ||
                    (pageNumber === currentPage + 2 && currentPage < totalPages - 2);

                  if (showEllipsis) {
                    return (
                      <span key={pageNumber} className="px-2 text-gray-400">
                        ···
                      </span>
                    );
                  }

                  if (!showPage) return null;

                  return (
                    <button
                      key={pageNumber}
                      onClick={() => fetchAnime(pageNumber)}
                      disabled={currentPage === pageNumber || loading}
                      className={`min-w-[44px] h-11 rounded-xl font-medium transition-all duration-200 ${
                        currentPage === pageNumber
                          ? 'bg-gradient-to-br from-purple-600 via-pink-600 to-indigo-600 text-white shadow-lg scale-110'
                          : 'bg-gray-100 text-gray-700 hover:bg-gradient-to-r hover:from-purple-100 hover:to-pink-100 hover:scale-105'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => fetchAnime(currentPage + 1)}
                disabled={currentPage === totalPages || loading}
                className="px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-medium hover:shadow-lg hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
              >
                <span className="hidden sm:inline">Next</span>
                <span>→</span>
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Anime Details Modal */}
      {showAnimeModal && selectedAnimeForModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 50 }}
            className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-2 border-purple-300/50 rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
          >
            {/* Modal Header with Gradient */}
            <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 p-6 relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00em0wLTEwYzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20"></div>
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-2xl">
                    🎬
                  </div>
                  <h2 className="text-3xl font-bold text-white drop-shadow-lg">Anime Details</h2>
                </div>
                <button
                  onClick={closeAnimeModal}
                  className="text-white/80 hover:text-white hover:bg-white/20 transition-all duration-200 p-3 rounded-xl backdrop-blur-sm"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto max-h-[calc(90vh-100px)] custom-scrollbar">
              {/* Modal Content */}
              <div className="p-6">
                <div className="flex flex-col lg:flex-row gap-6 mb-6">
                  {/* Poster */}
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex-shrink-0"
                  >
                    <div className="relative group">
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
                      <img
                        className="relative h-64 w-48 rounded-2xl object-cover border-4 border-white shadow-2xl transform group-hover:scale-105 transition-transform duration-300"
                        src={selectedAnimeForModal.poster_url || selectedAnimeForModal.thumbnail || '/placeholder-anime.jpg'}
                        alt={selectedAnimeForModal.title}
                        width={192}
                        height={256}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = 'https://via.placeholder.com/300x400/6366f1/ffffff?text=Anime';
                        }}
                      />
                    </div>
                  </motion.div>

                  {/* Details */}
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex-1"
                  >
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <h3 className="text-3xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 bg-clip-text text-transparent">
                        {selectedAnimeForModal.title}
                      </h3>
                      <span className={`px-4 py-1.5 rounded-full text-sm font-semibold backdrop-blur-sm border-2 ${getStatusColor(selectedAnimeForModal.status)} shadow-lg`}>
                        {getStatusIcon(selectedAnimeForModal.status)} {selectedAnimeForModal.status}
                      </span>
                    </div>
                    
                    <p className="text-gray-700 text-base leading-relaxed mb-6 bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-purple-200">
                      {selectedAnimeForModal.description || 'No description available'}
                    </p>
                    
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      <motion.div 
                        whileHover={{ scale: 1.05 }}
                        className="bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-xl p-4 border-2 border-indigo-300 shadow-md"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-2xl">🎬</span>
                          <span className="text-xs font-medium text-indigo-700">Episodes</span>
                        </div>
                        <p className="text-2xl font-bold text-indigo-900">{selectedAnimeForModal.episode_count || 0}</p>
                      </motion.div>
                      
                      <motion.div 
                        whileHover={{ scale: 1.05 }}
                        className="bg-gradient-to-br from-yellow-100 to-yellow-200 rounded-xl p-4 border-2 border-yellow-300 shadow-md"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-2xl">⭐</span>
                          <span className="text-xs font-medium text-yellow-700">Rating</span>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-yellow-900">
                            {analyticsLoading ? '...' : (animeAnalytics?.analytics?.averageRating || 'N/A')}
                          </p>
                          {!analyticsLoading && animeAnalytics?.analytics?.totalReviews > 0 && (
                            <p className="text-xs text-yellow-700">({animeAnalytics.analytics.totalReviews} reviews)</p>
                          )}
                        </div>
                      </motion.div>
                      
                      <motion.div 
                        whileHover={{ scale: 1.05 }}
                        className="bg-gradient-to-br from-purple-100 to-purple-200 rounded-xl p-4 border-2 border-purple-300 shadow-md"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-2xl">👀</span>
                          <span className="text-xs font-medium text-purple-700">Views</span>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-purple-900">
                            {analyticsLoading ? '...' : (animeAnalytics?.analytics?.views || 0).toLocaleString()}
                          </p>
                          {!analyticsLoading && animeAnalytics?.analytics?.completedViews > 0 && (
                            <p className="text-xs text-purple-700">({animeAnalytics.analytics.completedViews} completed)</p>
                          )}
                        </div>
                      </motion.div>
                      
                      <motion.div 
                        whileHover={{ scale: 1.05 }}
                        className="bg-gradient-to-br from-pink-100 to-pink-200 rounded-xl p-4 border-2 border-pink-300 shadow-md"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-2xl">📅</span>
                          <span className="text-xs font-medium text-pink-700">Added</span>
                        </div>
                        <p className="text-sm font-bold text-pink-900">{new Date(selectedAnimeForModal.created_at).toLocaleDateString()}</p>
                      </motion.div>
                      
                      <motion.div 
                        whileHover={{ scale: 1.05 }}
                        className="bg-gradient-to-br from-red-100 to-red-200 rounded-xl p-4 border-2 border-red-300 shadow-md"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-2xl">📊</span>
                          <span className="text-xs font-medium text-red-700">Reports</span>
                        </div>
                        <p className="text-2xl font-bold text-red-900">
                          {analyticsLoading ? '...' : (animeAnalytics?.analytics?.reports || 0)}
                        </p>
                      </motion.div>
                      
                      <motion.div 
                        whileHover={{ scale: 1.05 }}
                        className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl p-4 border-2 border-gray-300 shadow-md"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-2xl">🆔</span>
                          <span className="text-xs font-medium text-gray-700">Anime ID</span>
                        </div>
                        <p className="font-mono text-xs text-gray-900 truncate">{selectedAnimeForModal.id}</p>
                      </motion.div>
                    </div>
                    
                    {/* Genres */}
                    {selectedAnimeForModal.genres && selectedAnimeForModal.genres.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-purple-200"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xl">🏷️</span>
                          <span className="text-sm font-semibold text-gray-700">Genres:</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedAnimeForModal.genres.map((genre: string, index: number) => (
                            <span key={index} className="flex items-center space-x-1 px-2 py-1 bg-white/20 rounded-md text-white/90 text-xs">
                              <span>{getGenreIcon(genre)}</span>
                              <span>{genre}</span>
                            </span>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                </div>

                {/* Episodes Management */}
                <div className="border-t border-gray-200 pt-6 mt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xl font-bold text-gray-900">Episodes Management</h4>
                    {episodesCache[selectedAnimeForModal?.id] && (
                      <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-medium border border-green-500/30">
                        ⚡ {episodesCache[selectedAnimeForModal.id].length} episodes loaded instantly
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                  {episodesLoading ? (
                    <div className="text-center py-8">
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-white/60 text-sm">Loading episodes...</p>
                    </div>
                  ) : animeEpisodes.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="text-white/40 text-4xl mb-2">📺</div>
                      <p className="text-white/60">No episodes yet</p>
                      <p className="text-white/40 text-sm">Add the first episode to get started</p>
                    </div>
                  ) : (
                      animeEpisodes.map((episode) => (
                        <div key={episode.id} className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/10">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                {episode.episode_number}
                              </div>
                              <div>
                                <h5 className="text-white font-medium">{episode.title}</h5>
                                <p className="text-white/60 text-sm">
                                  Duration: {episode.duration ? `${Math.floor(episode.duration / 60)}:${(episode.duration % 60).toString().padStart(2, '0')}` : 'N/A'}
                                </p>
                                <p className="text-white/40 text-xs">
                                  Added: {new Date(episode.created_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleEditEpisode(episode)}
                                className="px-3 py-1 bg-blue-500/80 backdrop-blur-sm text-white rounded-md hover:bg-blue-600/80 transition-all duration-200 text-sm"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteEpisode(episode.id, episode.title)}
                                disabled={editingEpisode === episode.id}
                                className="px-3 py-1 bg-red-500/80 backdrop-blur-sm text-white rounded-md hover:bg-red-600/80 disabled:opacity-50 transition-all duration-200 text-sm"
                              >
                                {editingEpisode === episode.id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Add Anime Modal */}
      <AddAnimeModal
        isOpen={showAddAnimeModal}
        onClose={() => setShowAddAnimeModal(false)}
        onSuccess={handleAnimeCreated}
      />

      {/* Add Episode Modal */}
      {selectedAnimeForEpisode && (
        <AddEpisodeModal
          isOpen={showAddEpisodeModal}
          onClose={() => {
            setShowAddEpisodeModal(false);
            setSelectedAnimeForEpisode(null);
          }}
          onSuccess={handleEpisodeCreated}
          animeId={selectedAnimeForEpisode.id}
          animeTitle={selectedAnimeForEpisode.title}
          nextEpisodeNumber={(selectedAnimeForEpisode.episode_count || 0) + 1}
        />
      )}

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showConfirmationDialog}
        onClose={() => setShowConfirmationDialog(false)}
        onConfirm={confirmationConfig?.onConfirm || (() => {})}
        title={confirmationConfig?.title || ''}
        message={confirmationConfig?.message || ''}
        confirmText={confirmationConfig?.confirmText || 'Confirm'}
        type={confirmationConfig?.type || 'danger'}
        isLoading={updatingAnime !== null || editingEpisode !== null}
      />

      {/* Edit Episode Modal */}
      <EditEpisodeModal
        isOpen={showEditEpisodeModal}
        onClose={() => {
          setShowEditEpisodeModal(false);
          setSelectedEpisodeForEdit(null);
        }}
        onSuccess={handleEpisodeUpdated}
        episode={selectedEpisodeForEdit}
      />

      {/* Edit Anime Modal */}
      <EditAnimeModal
        isOpen={showEditAnimeModal}
        onClose={() => {
          setShowEditAnimeModal(false);
          setSelectedAnimeForEdit(null);
        }}
        onSuccess={handleAnimeUpdated}
        anime={selectedAnimeForEdit}
      />


      {/* Anime Importer Modal */}
      {showImporter && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-lg flex items-center justify-center z-50 p-4"
          onClick={() => setShowImporter(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            className="relative w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-3xl border border-purple-200/60 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/80 via-purple-500/80 to-pink-500/80" />
            <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top_left,_#fff5,_#ffffff00_45%)]" />

            <div className="relative flex items-center justify-between px-6 py-5 border-b border-white/20 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shadow-lg">
                  📥
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white drop-shadow">Anime Data Importer</h2>
                  <p className="text-white/80 text-sm">Bulk import with validation and previews</p>
                </div>
              </div>
              <button
                onClick={() => setShowImporter(false)}
                className="text-white/80 hover:text-white hover:bg-white/15 transition-all duration-200 p-3 rounded-xl"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="relative p-6 overflow-y-auto max-h-[calc(90vh-90px)] bg-white/5 backdrop-blur-xl">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 shadow-lg">
                <EnhancedAnimeImporter onImportComplete={handleAnimeImported} />
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Episode Scraper Modal */}
      {showScraper && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-lg flex items-center justify-center z-50 p-4"
          onClick={() => setShowScraper(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            className="relative w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-3xl border border-indigo-200/60 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/85 via-purple-600/85 to-pink-500/80" />
            <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_bottom_right,_#fff7,_#ffffff00_45%)]" />

            <div className="relative flex items-center justify-between px-6 py-5 border-b border-white/20 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shadow-lg">
                  🕸️
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white drop-shadow">HiAnime.do Scraper</h2>
                  <p className="text-white/80 text-sm">Streamed progress with SSE</p>
                </div>
              </div>
              <button
                onClick={() => setShowScraper(false)}
                className="text-white/80 hover:text-white hover:bg-white/15 transition-all duration-200 p-3 rounded-xl"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="relative p-6 overflow-y-auto max-h-[calc(90vh-90px)] bg-white/5 backdrop-blur-xl">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 shadow-lg">
                <AnimeScraperComponent />
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Scraped Episodes Modal */}
      {showScrapedEpisodesModal && selectedAnimeForScraping && (
        <ScrapedEpisodesModal
          isOpen={showScrapedEpisodesModal}
          onClose={handleCloseScrapedEpisodesModal}
          animeId={selectedAnimeForScraping.id}
          animeTitle={selectedAnimeForScraping.title}
          scrapedEpisodes={scrapedEpisodes}
          failedEpisodes={failedEpisodes}
          summary={scrapingSummary}
          onEpisodesAdded={() => {
            // Refresh episodes cache for this anime
            if (episodesCache[selectedAnimeForScraping.id]) {
              delete episodesCache[selectedAnimeForScraping.id];
              setEpisodesCache({ ...episodesCache });
            }
          }}
        />
      )}

      {/* Large Anime Scraper Modal */}
      {showLargeScraper && selectedAnimeForLargeScraping && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-xl z-50 flex items-center justify-center p-4"
          onClick={handleCloseLargeScraper}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 40 }}
            className="relative bg-gradient-to-br from-indigo-900/90 via-purple-900/90 to-black/90 border border-purple-500/30 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_top_left,_#a855f7_0,_transparent_40%)]" />
            <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_bottom_right,_#22d3ee_0,_transparent_45%)]" />

            <div className="relative flex items-center justify-between px-6 py-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-2xl text-white shadow-lg">
                  🚀
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white drop-shadow">Large Anime Scraper</h2>
                  <p className="text-white/70 text-sm">High-volume episode scraping with batching</p>
                </div>
              </div>
              <button
                onClick={handleCloseLargeScraper}
                className="text-white/80 hover:text-white hover:bg-white/15 transition-all duration-200 p-3 rounded-xl"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="relative p-6 overflow-y-auto max-h-[calc(90vh-110px)]">
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-xl">
                <LargeAnimeScraper
                  animeId={selectedAnimeForLargeScraping.id}
                  animeTitle={selectedAnimeForLargeScraping.title}
                  totalEpisodes={selectedAnimeForLargeScraping.total_episodes || 1000}
                  onScrapingComplete={async () => {
                    await handleCloseLargeScraper();
                    setSuccessMessage('Large scraping completed successfully! Episodes have been refreshed.');
                    setTimeout(() => setSuccessMessage(null), 5000);
                  }}
                />
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}