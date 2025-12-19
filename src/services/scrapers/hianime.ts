// Browser-compatible interfaces and types for HiAnime scraper
// The actual scraping logic is in the server-side script

export interface ScrapeResult {
  success: boolean;
  streamUrl?: string;
  episodeData?: any;
  error?: string;
}

export interface EpisodeScrapeData {
  animeId: string;
  episodeNumber: number;
  title: string;
  videoUrl: string;
  thumbnailUrl?: string;
  duration?: number;
  description?: string;
  createdAt: Date;
}

export interface BatchScrapeResult {
  success: boolean;
  results: ScrapeResult[];
  summary: {
    totalEpisodes: number;
    successCount: number;
    errorCount: number;
    successRate: number;
  };
}

// Browser-compatible service that calls the server-side scraper
export class HiAnimeScraperService {
  private static readonly API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

  /**
   * Scrape a single episode from HiAnime.do via backend API
   */
  static async scrapeAnimeEpisode(
    animeTitle: string,
    animeId: string,
    episodeNumber: number = 1,
    options: {
      headless?: boolean;
      timeout?: number;
      retries?: number;
    } = {}
  ): Promise<ScrapeResult> {
    try {
      console.log(`🎬 Scraping episode ${episodeNumber} for "${animeTitle}" (ID: ${animeId})`);

      const response = await fetch(`${this.API_BASE_URL}/api/scrape-episode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          animeTitle,
          animeId,
          episodeNumber,
          options
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error calling scraper API:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Scrape all available episodes for an anime
   */
  static async scrapeAllEpisodes(
    animeTitle: string,
    options: {
      animeId?: string;
      maxEpisodes?: number;
      timeout?: number;
      retries?: number;
    } = {}
  ): Promise<{
    success: boolean;
    data?: {
      animeTitle: string;
      animeId: string;
      totalEpisodes: number;
      scrapedEpisodes: Array<{
        number: number;
        title: string;
        streamUrl: string;
        embeddingProtected: boolean;
        embeddingReason?: string;
        scrapedAt: string;
      }>;
      failedEpisodes: Array<{
        number: number;
        title: string;
        error: string;
      }>;
      summary: {
        total: number;
        successful: number;
        failed: number;
        embeddingProtected: number;
      };
    };
    error?: string;
  }> {
    try {
      console.log(`🎬 Scraping all episodes for "${animeTitle}"`);

      const response = await fetch(`${this.API_BASE_URL}/api/scrape-all-episodes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          animeTitle,
          animeId: options.animeId,
          maxEpisodes: options.maxEpisodes || 20,
          timeout: options.timeout || 60000,
          retries: options.retries || 2
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error calling scrape all episodes API:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Add a scraped episode to the database
   */
  static async addScrapedEpisode(
    animeId: string,
    episodeData: {
      number: number;
      title: string;
      streamUrl: string;
      embeddingProtected: boolean;
      embeddingReason?: string;
    }
  ): Promise<{
    success: boolean;
    message?: string;
    episode?: any;
    error?: string;
  }> {
    try {
      console.log(`💾 Adding episode ${episodeData.number} to database for anime ${animeId}`);

      const response = await fetch(`${this.API_BASE_URL}/api/add-scraped-episode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          animeId,
          episodeData
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error adding scraped episode:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Batch scrape multiple episodes
   */
  static async batchScrapeEpisodes(
    animeTitle: string,
    animeId: string,
    episodeNumbers: number[],
    options: {
      headless?: boolean;
      timeout?: number;
      retries?: number;
      delayBetweenEpisodes?: number;
    } = {}
  ): Promise<BatchScrapeResult> {
    try {
      console.log(`🎬 Batch scraping ${episodeNumbers.length} episodes for "${animeTitle}"`);

      const response = await fetch(`${this.API_BASE_URL}/api/batch-scrape-episodes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          animeTitle,
          animeId,
          episodeNumbers,
          options
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error in batch scraping:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        results: [],
        summary: {
          totalEpisodes: episodeNumbers.length,
          successCount: 0,
          errorCount: episodeNumbers.length,
          successRate: 0
        }
      };
    }
  }

  /**
   * Test the scraper (browser-compatible version)
   */
  static async testScraper(): Promise<void> {
    console.log('🧪 Testing HiAnime Scraper (Browser Mode)...');
    console.log('Note: Actual scraping requires server-side execution');
    console.log('Use the command line script: npm run scrape-hianime -- --test');
  }
}