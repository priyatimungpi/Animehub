import { useState, useEffect } from 'react';
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

  const handleAnimeCreated = async (newAnime?: any) => {
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

  const handleEpisodeCreated = async (newEpisode?: any) => {
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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Anime Management</h1>
              <p className="mt-2 text-gray-600">Manage your anime content library</p>
            </div>
            <div className="flex space-x-3 mt-4 sm:mt-0">
              <button
                onClick={() => setShowAddAnimeModal(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center space-x-2"
              >
                <span className="text-lg">🎬</span>
                <span>Add New Anime</span>
              </button>
              <button
                onClick={() => setShowImporter(true)}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center space-x-2"
              >
                <span className="text-lg">📥</span>
                <span>Import Anime</span>
              </button>
              <button
                onClick={() => setShowScraper(true)}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors duration-200 flex items-center space-x-2"
              >
                <span className="text-lg">🎬</span>
                <span>Episode Scraper</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600 text-lg">🎬</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Anime</p>
                <p className="text-2xl font-bold text-gray-900">{totalAnime}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-green-600 text-lg">✅</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Published</p>
                <p className="text-2xl font-bold text-gray-900">
                  {anime.filter(a => a.status === 'published').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <span className="text-yellow-600 text-lg">⏳</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Pending</p>
                <p className="text-2xl font-bold text-gray-900">
                  {anime.filter(a => a.status === 'pending').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-gray-600 text-lg">📝</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Drafts</p>
                <p className="text-2xl font-bold text-gray-900">
                  {anime.filter(a => a.status === 'draft').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 mb-6">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          
          {successMessage && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
              {successMessage}
            </div>
          )}

          {/* Preloading Status */}
          {Object.keys(episodesCache).length > 0 && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
                <span className="text-sm">
                  ⚡ Preloaded episodes for {Object.keys(episodesCache).length} anime - Click "View Details" for instant loading!
                </span>
              </div>
            </div>
          )}
          
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="md:col-span-2">
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
                Search Anime
              </label>
                  <input
                    type="text"
                id="search"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Search by title or description..."
                    value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                  />
              </div>

            {/* Status Filter */}
              <div>
              <label htmlFor="statusFilter" className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Status
              </label>
                <select
                id="statusFilter"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="all">All Status</option>
                  <option value="published">Published</option>
                  <option value="pending">Pending</option>
                  <option value="draft">Draft</option>
                </select>
              </div>

            {/* Genre Filter */}
              <div>
              <label htmlFor="genreFilter" className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Genre
              </label>
                <select
                id="genreFilter"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                value={filterGenre}
                onChange={(e) => setFilterGenre(e.target.value)}
                >
                  <option value="all">All Genres</option>
                  <option value="action">Action</option>
                  <option value="romance">Romance</option>
                  <option value="comedy">Comedy</option>
                  <option value="drama">Drama</option>
                  <option value="fantasy">Fantasy</option>
                <option value="sci-fi">Sci-Fi</option>
                <option value="horror">Horror</option>
                <option value="slice of life">Slice of Life</option>
                </select>
            </div>
          </div>
              </div>

        {/* Bulk Actions */}
        {selectedAnime.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-blue-800 font-medium">
                {selectedAnime.size} anime selected
              </span>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleBulkAction('published')}
                  disabled={updatingAnime === 'bulk'}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {updatingAnime === 'bulk' ? 'Updating...' : 'Publish Selected'}
                </button>
                <button
                  onClick={() => handleBulkAction('pending')}
                  disabled={updatingAnime === 'bulk'}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {updatingAnime === 'bulk' ? 'Updating...' : 'Mark Pending'}
                </button>
                <button
                  onClick={() => handleBulkAction('draft')}
                  disabled={updatingAnime === 'bulk'}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {updatingAnime === 'bulk' ? 'Updating...' : 'Mark Draft'}
                </button>
                <button
                  onClick={() => handleBulkAction('delete')}
                  disabled={updatingAnime === 'bulk'}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {updatingAnime === 'bulk' ? 'Deleting...' : 'Delete Selected'}
                </button>
                <button
                  onClick={() => setSelectedAnime(new Set())}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Select All Header */}
        {!loading && filteredAnime.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
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

        {/* Anime List */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAnime.map((item) => (
          <motion.div
                key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  {/* Anime Info */}
                  <div className="flex-1 flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <img
                        className="h-24 w-18 rounded-lg object-cover shadow-md"
                        src={item.poster_url || item.thumbnail || '/placeholder-anime.jpg'}
                        alt={item.title}
                        width={72}
                        height={96}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = 'https://via.placeholder.com/150x200/6366f1/ffffff?text=Anime';
                        }}
                      />
                </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-xl font-semibold text-gray-900">{item.title}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(item.status)}`}>
                          {getStatusIcon(item.status)} {item.status}
                        </span>
                        {episodesCache[item.id] && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            ⚡ {episodesCache[item.id].length} episodes ready
                          </span>
                        )}
            </div>

                      <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                        {item.description || 'No description available'}
                      </p>
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center space-x-1">
                          <span className="text-lg">🎬</span>
                          <span>{item.episode_count || 0} episodes</span>
                        </span>
                        
                        <span className="flex items-center space-x-1">
                          <span className="text-lg">⭐</span>
                          <span>Rating: {item.average_rating || 'N/A'}</span>
                        </span>
                        
                        <span className="flex items-center space-x-1">
                          <span className="text-lg">👀</span>
                          <span>{item.views?.toLocaleString() || '0'} views</span>
                        </span>
                        
                        <span className="flex items-center space-x-1">
                          <span className="text-lg">📅</span>
                          <span>{new Date(item.created_at).toLocaleDateString()}</span>
                        </span>
                        
                        {item.genres && item.genres.length > 0 && (
                          <div className="flex items-center space-x-1">
                            <span className="text-lg">🏷️</span>
                            <div className="flex space-x-1">
                              {item.genres.slice(0, 3).map((genre: string, index: number) => (
                                <span key={index} className="flex items-center space-x-1">
                                  <span>{getGenreIcon(genre)}</span>
                                  <span>{genre}</span>
                                </span>
                              ))}
                              {item.genres.length > 3 && (
                                <span className="text-gray-400">+{item.genres.length - 3} more</span>
                              )}
                </div>
              </div>
                        )}
                </div>
              </div>
            </div>

                  {/* Actions */}
                  <div className="flex flex-col space-y-3">
                    {/* Status Change */}
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-medium text-gray-700">Status:</label>
                      <div className="flex items-center space-x-2">
                        <select
                          value={item.status}
                          onChange={(e) => handleStatusChange(item.id, e.target.value as any)}
                          disabled={updatingAnime === item.id}
                          className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                        >
                          <option value="published">Published</option>
                          <option value="pending">Pending</option>
                          <option value="draft">Draft</option>
                        </select>
                        {updatingAnime === item.id && (
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        )}
                </div>
              </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => handleViewAnimeDetails(item)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => handleEditAnime(item)}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleAddEpisode(item)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                      >
                        Add Episode
                      </button>
                      <button
                        onClick={() => handleScrapAnime(item)}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm flex items-center space-x-1"
                      >
                        <span>🎬</span>
                        <span>Scrap Episodes</span>
                      </button>
                      <button
                        onClick={() => handleLargeScrape(item)}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm flex items-center space-x-1"
                      >
                        <span>🚀</span>
                        <span>Large Scrape</span>
                      </button>
                      <button
                        onClick={() => handleDeleteAnime(item.id, item.title)}
                        disabled={updatingAnime === item.id}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                      >
                        {updatingAnime === item.id ? 'Deleting...' : 'Delete'}
                      </button>
            </div>

                    {/* Selection Checkbox */}
                    <div className="flex items-center space-x-2">
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
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-500">Select for bulk action</span>
                    </div>
                          </div>
                        </div>
              </motion.div>
            ))}
            
            {filteredAnime.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">🎬</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No anime found</h3>
                <p className="text-gray-500">
                  {searchTerm || filterStatus !== 'all' || filterGenre !== 'all'
                    ? 'No anime match your current filters.'
                    : 'There are no anime to display.'
                  }
                </p>
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center mt-8 space-x-2">
                          <button
              onClick={() => fetchAnime(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
            >
              Previous
                          </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNumber => (
                          <button
                key={pageNumber}
                onClick={() => fetchAnime(pageNumber)}
                disabled={currentPage === pageNumber || loading}
                className={`px-4 py-2 rounded-lg ${
                  currentPage === pageNumber
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {pageNumber}
                          </button>
            ))}
                          <button
              onClick={() => fetchAnime(currentPage + 1)}
              disabled={currentPage === totalPages || loading}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                          >
              Next
                          </button>
                        </div>
        )}
      </div>

      {/* Anime Details Modal */}
      {showAnimeModal && selectedAnimeForModal && (
        <div className="fixed inset-0 bg-gradient-to-br from-blue-900/20 via-purple-900/20 to-pink-900/20 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">Anime Details</h2>
              <button
                onClick={closeAnimeModal}
                className="text-white/70 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <div className="flex items-start space-x-6 mb-6">
                {/* Poster */}
                <div className="flex-shrink-0">
                  <img
                    className="h-48 w-36 rounded-xl object-cover border-4 border-white/30 shadow-xl"
                    src={selectedAnimeForModal.poster_url || selectedAnimeForModal.thumbnail || '/placeholder-anime.jpg'}
                    alt={selectedAnimeForModal.title}
                    width={144}
                    height={192}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = 'https://via.placeholder.com/300x400/6366f1/ffffff?text=Anime';
                    }}
                  />
                </div>

                {/* Details */}
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-3">
                    <h3 className="text-3xl font-bold text-white drop-shadow-lg">{selectedAnimeForModal.title}</h3>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm border border-white/20 ${getStatusColor(selectedAnimeForModal.status)}`}>
                      {getStatusIcon(selectedAnimeForModal.status)} {selectedAnimeForModal.status}
                    </span>
                  </div>
                  
                  <p className="text-white/80 text-lg mb-4 drop-shadow-sm">
                    {selectedAnimeForModal.description || 'No description available'}
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                      <span className="text-white/70">🎬</span>
                      <span className="text-white/90">{selectedAnimeForModal.episode_count || 0} episodes</span>
                    </div>
                    
                    <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                      <span className="text-white/70">⭐</span>
                      <span className="text-white/90">
                        Rating: {analyticsLoading ? 'Loading...' : (animeAnalytics?.analytics?.averageRating || 'N/A')} 
                        {!analyticsLoading && animeAnalytics?.analytics?.totalReviews > 0 && (
                          <span className="text-white/60">({animeAnalytics.analytics.totalReviews} reviews)</span>
                        )}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                      <span className="text-white/70">👀</span>
                      <span className="text-white/90">
                        {analyticsLoading ? 'Loading...' : (animeAnalytics?.analytics?.views || 0)} views
                        {!analyticsLoading && animeAnalytics?.analytics?.completedViews > 0 && (
                          <span className="text-white/60"> ({animeAnalytics.analytics.completedViews} completed)</span>
                        )}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                      <span className="text-white/70">📅</span>
                      <span className="text-white/90">{new Date(selectedAnimeForModal.created_at).toLocaleDateString()}</span>
                    </div>
                    
                    <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                      <span className="text-white/70">📊</span>
                      <span className="text-white/90">
                        {analyticsLoading ? 'Loading...' : (animeAnalytics?.analytics?.reports || 0)} reports
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                      <span className="text-white/70">🆔</span>
                      <span className="font-mono text-xs text-white/90">{selectedAnimeForModal.id}</span>
                    </div>
                    
                    {selectedAnimeForModal.genres && selectedAnimeForModal.genres.length > 0 && (
                      <div className="col-span-2 bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-white/70">🏷️</span>
                          <span className="text-white/90 font-medium">Genres:</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedAnimeForModal.genres.map((genre: string, index: number) => (
                            <span key={index} className="flex items-center space-x-1 px-2 py-1 bg-white/20 rounded-md text-white/90 text-xs">
                              <span>{getGenreIcon(genre)}</span>
                              <span>{genre}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="border-t border-white/10 pt-6">
                <h4 className="text-lg font-semibold text-white drop-shadow-lg mb-4">Quick Actions</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-white/80">Change Status</label>
                    <select
                      value={selectedAnimeForModal.status}
                      onChange={(e) => {
                        handleStatusChange(selectedAnimeForModal.id, e.target.value as any);
                        setSelectedAnimeForModal({...selectedAnimeForModal, status: e.target.value});
                      }}
                      disabled={updatingAnime === selectedAnimeForModal.id}
                      className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder-white/50 focus:ring-2 focus:ring-white/30 focus:border-white/30 disabled:opacity-50"
                    >
                      <option value="published" className="bg-gray-800 text-white">Published</option>
                      <option value="pending" className="bg-gray-800 text-white">Pending</option>
                      <option value="draft" className="bg-gray-800 text-white">Draft</option>
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-white/80">Actions</label>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          handleEditAnime(selectedAnimeForModal);
                          closeAnimeModal();
                        }}
                        className="px-4 py-2 bg-purple-500/80 backdrop-blur-sm text-white rounded-lg hover:bg-purple-600/80 transition-all duration-200 border border-purple-400/30 hover:border-purple-400/50"
                      >
                        Edit Anime
                      </button>
                      <button
                        onClick={() => {
                          handleAddEpisode(selectedAnimeForModal);
                          closeAnimeModal();
                        }}
                        className="px-4 py-2 bg-green-500/80 backdrop-blur-sm text-white rounded-lg hover:bg-green-600/80 transition-all duration-200 border border-green-400/30 hover:border-green-400/50"
                      >
                        Add Episode
                      </button>
                      <button
                        onClick={() => {
                          handleScrapAnime(selectedAnimeForModal);
                        }}
                        className="px-4 py-2 bg-orange-500/80 backdrop-blur-sm text-white rounded-lg hover:bg-orange-600/80 transition-all duration-200 border border-orange-400/30 hover:border-orange-400/50 flex items-center space-x-1"
                      >
                        <span>🎬</span>
                        <span>Scrap Episodes</span>
                      </button>
                      <button
                        onClick={() => {
                          handleLargeScrape(selectedAnimeForModal);
                        }}
                        className="px-4 py-2 bg-purple-500/80 backdrop-blur-sm text-white rounded-lg hover:bg-purple-600/80 transition-all duration-200 border border-purple-400/30 hover:border-purple-400/50 flex items-center space-x-1"
                      >
                        <span>🚀</span>
                        <span>Large Scrape</span>
                      </button>
                  <button
                        onClick={() => {
                          handleDeleteAnime(selectedAnimeForModal.id, selectedAnimeForModal.title);
                          closeAnimeModal();
                        }}
                        disabled={updatingAnime === selectedAnimeForModal.id}
                        className="px-4 py-2 bg-red-500/80 backdrop-blur-sm text-white rounded-lg hover:bg-red-600/80 disabled:opacity-50 transition-all duration-200 border border-red-400/30 hover:border-red-400/50"
                      >
                        Delete Anime
                  </button>
                      <button
                        onClick={closeAnimeModal}
                        className="px-4 py-2 bg-white/10 backdrop-blur-sm text-white rounded-lg hover:bg-white/20 transition-all duration-200 border border-white/20 hover:border-white/30"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Episodes Management */}
              <div className="border-t border-white/10 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold text-white drop-shadow-lg">Episodes Management</h4>
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
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowImporter(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Anime Data Importer</h2>
              <button
                onClick={() => setShowImporter(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-full hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6" onClick={(e) => e.stopPropagation()}>
              <EnhancedAnimeImporter onImportComplete={handleAnimeImported} />
            </div>
          </motion.div>
        </div>
      )}

      {/* Episode Scraper Modal */}
      {showScraper && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowScraper(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">HiAnime.do Scraper</h2>
              <button
                onClick={() => setShowScraper(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-full hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6" onClick={(e) => e.stopPropagation()}>
              <AnimeScraperComponent />
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
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={handleCloseLargeScraper}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800">
                🚀 Large Anime Scraper
              </h2>
              <button
                onClick={handleCloseLargeScraper}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
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
          </motion.div>
        </div>
      )}
    </div>
  );
}