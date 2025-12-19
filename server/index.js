import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';
// Redis removed - using in-memory cache only
// import Redis from 'ioredis';
import { promises as fs } from 'fs';
import { resolve as resolvePath, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';
import { requestIdMiddleware, errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { getHelmetConfig, getCorsConfig, rateLimiter, sanitizeInput, validateRequestSize } from './middleware/security.js';
import { getHealthHandler, getDetailedHealthHandler } from './routes/health.js';

// Get the directory name of the current module (for ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (one level up from server/)
dotenv.config({ path: join(__dirname, '..', '.env') });

// Apply stealth plugin to avoid detection
chromium.use(StealthPlugin());

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const app = express();
const PORT = process.env.PORT || 3001;

// Using in-memory cache (Redis disabled)
const inMemoryCache = new Map();
const IN_MEMORY_MAX_ENTRIES = parseInt(process.env.IN_MEMORY_MAX_ENTRIES || '1000', 10);
let redis = null; // Redis disabled
console.log('✅ Using in-memory cache for performance optimization');

async function cacheGet(key) {
  // Using in-memory cache only
  const entry = inMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    inMemoryCache.delete(key);
    return null;
  }
  return entry.value;
}
async function cacheSet(key, value, ttlMs = 60_000) {
  // Using in-memory cache only
  inMemoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  // LRU-style trim when exceeding capacity
  if (inMemoryCache.size > IN_MEMORY_MAX_ENTRIES) {
    const toDelete = inMemoryCache.size - IN_MEMORY_MAX_ENTRIES;
    let i = 0;
    for (const k of inMemoryCache.keys()) {
      inMemoryCache.delete(k);
      i++;
      if (i >= toDelete) break;
    }
  }
}
function cacheMiddleware(ttlMs = 60_000) {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();
    const key = `${req.method}:${req.originalUrl}`;
    try {
      const cached = await cacheGet(key);
      if (cached) {
        res.set('X-Cache', 'HIT');
        return res.json(cached);
      }
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        res.set('X-Cache', 'MISS');
        try { void cacheSet(key, body, ttlMs); } catch {}
        return originalJson(body);
      };
      next();
    } catch (err) {
      // On cache error, proceed without cache
      next();
    }
  };
}

// Middleware
app.use(requestIdMiddleware); // Request ID for error correlation
app.use(helmet(getHelmetConfig())); // Enhanced security headers
// Enable HTTP keep-alive
app.use((req, res, next) => {
  res.set('Connection', 'keep-alive');
  next();
});
app.use(cors(getCorsConfig())); // Configurable CORS
app.use(validateRequestSize()); // Request size validation
app.use(sanitizeInput); // Input sanitization
// Tune compression; skip small bodies and likely already-compressed content
app.use(compression({ threshold: 4096, filter: (req, res) => {
  const url = req.url || '';
  if (url.endsWith('.m3u8') || url.endsWith('.mpd') || url.endsWith('.ts')) return false;
  return compression.filter(req, res);
} }));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Axios: enable HTTP keep-alive agents for upstream requests
axios.defaults.timeout = 15000;
axios.defaults.httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
axios.defaults.httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

// Rate limiting - general API rate limit
app.use('/api', rateLimiter.middleware(60_000, 60)); // 60 requests per minute

// Stricter rate limiting for scraper endpoints
app.use('/api/scrape', rateLimiter.middleware(60_000, 10)); // 10 requests per minute

// Performance metrics collector
app.post('/api/perf-metrics', async (req, res) => {
  try {
    const payload = req.body;
    const filePath = resolvePath(process.cwd(), 'performance-report.json');
    let existing = [];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      existing = JSON.parse(content);
      if (!Array.isArray(existing)) existing = [];
    } catch {}
    existing.push(payload);
    await fs.writeFile(filePath, JSON.stringify(existing, null, 2));
    res.json({ success: true });
  } catch (e) {
    console.error('perf-metrics write failed', e);
    res.status(500).json({ success: false });
  }
});

// Playwright browser pooling and concurrency control
let sharedBrowser = null;
const maxConcurrency = parseInt(process.env.SCRAPER_MAX_CONCURRENCY || '2', 10);
let activeCount = 0;
const queue = [];
// Circuit breaker for scraper
let breakerFailures = 0;
let breakerOpenedAt = 0;
const BREAKER_THRESHOLD = parseInt(process.env.SCRAPER_BREAKER_THRESHOLD || '8', 10);
const BREAKER_COOLDOWN_MS = parseInt(process.env.SCRAPER_BREAKER_COOLDOWN_MS || '30000', 10);

async function getBrowser() {
  try {
    if (sharedBrowser) {
      // Verify browser is valid by checking for newContext method
      if (typeof sharedBrowser.newContext === 'function') {
        return sharedBrowser;
      } else {
        // Browser is invalid, reset it
        console.log('⚠️ Shared browser is invalid, resetting...');
        sharedBrowser = null;
      }
    }
    console.log('🔄 Launching new browser instance...');
    sharedBrowser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
    if (!sharedBrowser) {
      throw new Error('chromium.launch() returned null/undefined');
    }
    console.log('✅ Browser instance created successfully');
    return sharedBrowser;
  } catch (error) {
    console.error('❌ Failed to get browser:', error);
    sharedBrowser = null; // Reset on error
    throw error;
  }
}

function enqueue(task) {
  return new Promise((resolve, reject) => {
    // Circuit breaker: fast-fail when open
    if (breakerOpenedAt && Date.now() - breakerOpenedAt < BREAKER_COOLDOWN_MS) {
      return reject(new Error('Scraper temporarily unavailable (circuit open)'));
    }
    const run = async () => {
      activeCount++;
      try {
        const result = await task();
        // reset breaker on success
        breakerFailures = 0;
        breakerOpenedAt = 0;
        resolve(result);
      } catch (e) {
        breakerFailures++;
        if (breakerFailures >= BREAKER_THRESHOLD) {
          breakerOpenedAt = Date.now();
        }
        reject(e);
      } finally {
        activeCount--;
        if (queue.length > 0) {
          const next = queue.shift();
          next();
        }
      }
    };

    if (activeCount < maxConcurrency) {
      void run();
    } else {
      queue.push(run);
    }
  });
}

// Scraper service
class NineAnimeScraperService {
  static BASE_URL = 'https://9anime.org.lv';
  static USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  static async scrapeAnimeEpisode(animeTitle, episodeNumber = 1, options = {}) {
    const { timeout = 45000, retries = 3 } = options;

    console.log(`🎬 Scraping 9anime.org.lv for "${animeTitle}", Episode ${episodeNumber}...`);

    let lastError = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Step 1: Use Cheerio for fast search
        const searchResult = await this.searchAnimeWithCheerio(animeTitle, episodeNumber);

        if (!searchResult.success) {
          throw new Error(searchResult.error || 'Search failed');
        }

        const { animeLink, animeId } = searchResult;
        console.log(`🔍 DEBUG: animeLink = ${animeLink}, episodeNumber = ${episodeNumber}`);

        // Step 2: Use Puppeteer for dynamic video extraction (queued)
        const videoResult = await enqueue(() => this.extractVideoWithPuppeteer(animeLink, animeId, episodeNumber, { timeout }));

        if (!videoResult.success) {
          throw new Error(videoResult.error || 'Video extraction failed');
        }

        // Step 3: Check for anti-embedding protection
        const embeddingCheck = await this.checkEmbeddingProtection(videoResult.streamUrl);

        const finalEpisodeData = {
          animeTitle,
          animeId,
          animeLink,
          ...videoResult.episodeData,
          episodeNumber  // Put this after the spread to ensure it's not overwritten
        };

        console.log(`🔍 DEBUG: Final episodeData = ${JSON.stringify(finalEpisodeData)}`);
        console.log('📦 DEBUG: Returning from scrapeAnimeEpisode - streamUrl:', videoResult.streamUrl);

        return {
          success: true,
          streamUrl: videoResult.streamUrl,
          embeddingProtected: embeddingCheck.protected,
          embeddingReason: embeddingCheck.reason,
          episodeData: finalEpisodeData
        };

      } catch (error) {
        lastError = error;
        console.error(`❌ Attempt ${attempt} failed:`, error.message);

        if (attempt < retries) {
          console.log(`⏳ Retrying in 2 seconds... (${attempt}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Unknown error occurred'
    };
  }

  // New method to scrape all available episodes
  static async scrapeAllEpisodes(animeTitle, options = {}) {
    const { maxEpisodes = 50, timeout = 45000, retries = 2 } = options;

    console.log(`🎬 Scraping all episodes for "${animeTitle}" (max ${maxEpisodes})...`);

    try {
      // Step 1: Find the anime and get episode list (use episode 1 for initial search)
      const searchResult = await this.searchAnimeWithCheerio(animeTitle, 1);

      if (!searchResult.success) {
        return { success: false, error: searchResult.error || 'Search failed' };
      }

      const { animeLink, animeId } = searchResult;

      // Step 2: Get available episodes from the anime page
      const episodesResult = await this.getAvailableEpisodes(animeLink, animeId, maxEpisodes);

      if (!episodesResult.success) {
        return { success: false, error: episodesResult.error || 'Failed to get episodes' };
      }

      const { episodes, totalEpisodes } = episodesResult;
      console.log(`📺 Found ${totalEpisodes} total episodes, checking first ${episodes.length}...`);

      // Step 3: Scrape each episode
      const scrapedEpisodes = [];
      const failedEpisodes = [];

      for (const episode of episodes) {
        try {
          console.log(`🎬 Scraping Episode ${episode.number}: "${episode.title}"`);

          const episodeResult = await this.scrapeAnimeEpisode(animeTitle, episode.number, {
            timeout: timeout / episodes.length, // Distribute timeout across episodes
            retries
          });

          if (episodeResult.success) {
            scrapedEpisodes.push({
              ...episode,
              streamUrl: episodeResult.streamUrl,
              embeddingProtected: episodeResult.embeddingProtected,
              embeddingReason: episodeResult.embeddingReason,
              scrapedAt: new Date().toISOString()
            });
            console.log(`✅ Episode ${episode.number} scraped successfully`);
          } else {
            failedEpisodes.push({
              ...episode,
              error: episodeResult.error
            });
            console.log(`❌ Episode ${episode.number} failed: ${episodeResult.error}`);
          }

          // Small delay between episodes to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          failedEpisodes.push({
            ...episode,
            error: error.message
          });
          console.log(`❌ Episode ${episode.number} error: ${error.message}`);
        }
      }

      return {
        success: true,
        animeTitle,
        animeId,
        totalEpisodes,
        scrapedEpisodes,
        failedEpisodes,
        summary: {
          total: episodes.length,
          successful: scrapedEpisodes.length,
          failed: failedEpisodes.length,
          embeddingProtected: scrapedEpisodes.filter(ep => ep.embeddingProtected).length
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get available episodes from anime page
  static async getAvailableEpisodes(animeLink, animeId, maxEpisodes = 50) {
    try {
      console.log('📺 Getting available episodes...');

      const response = await axios.get(animeLink, {
        headers: { 'User-Agent': this.USER_AGENT },
        timeout: 15000
      });

      const $ = cheerio.load(response.data);

      // Extract anime slug from the URL for filtering
      const animeSlug = animeLink.match(/\/([^\/]+)-episode-\d+/)?.[1] ||
                        animeLink.match(/anime\/([^\/]+)/)?.[1] ||
                        animeId;

      console.log(`🔍 Looking for episodes with anime slug: ${animeSlug}`);

      // Look for episode lists in specific containers ONLY (not all links)
      const episodes = [];

      // Method 1: Look for episode lists in specific containers ONLY
      const episodeContainers = $('.episode-list, .episodes, .episode-item, [class*="episode"]');

      episodeContainers.each((i, container) => {
        const episodeItems = $(container).find('a, .episode, [class*="episode"]');

        episodeItems.each((j, item) => {
          const text = $(item).text().trim();
          const href = $(item).attr('href');

          if (text && href) {
            // Check if this link belongs to the same anime
            const isSameAnime = href.includes(animeSlug) ||
                                href.includes(animeId) ||
                                href.includes(animeLink.split('/').pop()?.split('-episode')[0]);

            if (isSameAnime) {
              // Extract episode number from URL or text
              const episodeMatch = href.match(/-episode-(\d+)/) ||
                                   href.match(/\/episode\/(\d+)/) ||
                                   href.match(/\/watch\/.*?(\d+)/) ||
                                   text.match(/episode\s*(\d+)/i) ||
                                   text.match(/ep\s*(\d+)/i);

              if (episodeMatch) {
                const episodeNumber = parseInt(episodeMatch[1]);
                if (episodeNumber && episodeNumber <= maxEpisodes) {
                  episodes.push({
                    number: episodeNumber,
                    title: text,
                    url: href.startsWith('http') ? href : this.BASE_URL + href
                  });
                }
              } else if (text.match(/\d+/)) {
                // Fallback: extract number from text
                const episodeNumber = parseInt(text.match(/\d+/)[0]);
                if (episodeNumber && episodeNumber <= maxEpisodes) {
                  episodes.push({
                    number: episodeNumber,
                    title: text,
                    url: href.startsWith('http') ? href : this.BASE_URL + href
                  });
                }
              }
            }
          }
        });
      });

      // Remove duplicates and sort by episode number
      const uniqueEpisodes = episodes.filter((ep, index, self) =>
        index === self.findIndex(e => e.number === ep.number)
      ).sort((a, b) => a.number - b.number);

      // If no episodes found, try to construct episode URLs based on the anime pattern
      let filteredEpisodes = uniqueEpisodes;
      if (uniqueEpisodes.length === 0) {
        console.log('⚠️ No episodes found, constructing episode URLs...');

        // For movies, there should only be 1 episode
        if (animeSlug.toLowerCase().includes('film') || animeSlug.toLowerCase().includes('movie')) {
          filteredEpisodes.push({
            number: 1,
            title: 'Movie',
            url: animeLink // Use the original link as it's already episode 1
          });
        } else {
          // For regular anime, try to construct episode URLs
          for (let i = 1; i <= Math.min(12, maxEpisodes); i++) {
            const episodeUrl = animeLink.replace(/-episode-\d+/, `-episode-${i}`);
            filteredEpisodes.push({
              number: i,
              title: `Episode ${i}`,
              url: episodeUrl
            });
          }
        }
      }

      // Additional filtering: Remove episodes that don't belong to this anime
      filteredEpisodes = filteredEpisodes.filter(episode => {
        // For movies, only allow episode 1
        if (animeSlug.toLowerCase().includes('film') || animeSlug.toLowerCase().includes('movie')) {
          return episode.number === 1;
        }
        // For regular anime, check if the episode URL actually exists (we'll let the scraper handle validation)
        return true;
      });

      console.log(`✅ Found ${filteredEpisodes.length} episodes for ${animeSlug}`);
      console.log('Episodes:', filteredEpisodes.map(ep => `Ep ${ep.number}: ${ep.title}`));

      return {
        success: true,
        episodes: filteredEpisodes,
        totalEpisodes: filteredEpisodes.length
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Check if video source has anti-embedding protection
  static async checkEmbeddingProtection(videoUrl) {
    try {
      console.log('🔍 Checking for anti-embedding protection...');

      const response = await axios.get(videoUrl, {
        headers: { 'User-Agent': this.USER_AGENT },
        timeout: 10000,
        validateStatus: (status) => status < 500
      });

      const html = response.data;

      // Check for common anti-embedding patterns
      const antiEmbeddingPatterns = [
        /if\s*\(\s*window\s*==\s*window\.top\s*\)/i,
        /window\.location\.replace/i,
        /window\.top\.location/i,
        /parent\.location/i,
        /top\.location/i,
        /frameElement/i,
        /anti-embed/i,
        /embedding.*block/i,
        /no.*embed/i
      ];

      const protectionReasons = [];

      for (const pattern of antiEmbeddingPatterns) {
        if (pattern.test(html)) {
          protectionReasons.push(pattern.toString());
        }
      }

      // Check for Cloudflare protection (but be lenient with all mega domains)
      if (html.includes('cloudflare') || html.includes('challenge-platform')) {
        if (videoUrl.match(/mega(play|cloud|backup|cdn|stream)/i)) {
          console.log('🎯 Mega domain detected - Cloudflare protection is usually embeddable');
          // Don't add to protection reasons for mega domains
        } else {
          protectionReasons.push('Cloudflare protection detected');
        }
      }

      // Check for dynamic iframe loading
      if (html.includes('data-src') && !html.includes('src=')) {
        protectionReasons.push('Dynamic iframe loading detected');
      }

      // Special case: All mega domains are generally embeddable even with some protection
      const isProtected = protectionReasons.length > 0 && !videoUrl.match(/mega(play|cloud|backup|cdn|stream)/i);

      console.log(`${isProtected ? '⚠️' : '✅'} Embedding protection: ${isProtected ? 'DETECTED' : 'NONE'}`);
      if (isProtected) {
        console.log('Reasons:', protectionReasons);
      }

      return {
        protected: isProtected,
        reason: isProtected ? protectionReasons.join(', ') : null
      };

    } catch (error) {
      console.log('⚠️ Could not check embedding protection:', error.message);
      return {
        protected: true, // Assume protected if we can't check
        reason: `Check failed: ${error.message}`
      };
    }
  }

  static async searchAnimeWithCheerio(animeTitle, episodeNumber = 1) {
    // Cached search to reduce upstream calls
    try {
      const cached = await cacheGet(`search:${animeTitle}:${episodeNumber}`);
      if (cached) return cached;
    } catch {}
    try {
      // Try direct URL construction FIRST for better accuracy
      const titleSlug = animeTitle.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .trim();

      const directUrl = `${this.BASE_URL}/${titleSlug}-episode-${episodeNumber}/`;
      console.log(`🔗 Testing direct URL construction first: ${directUrl}`);
      console.log(`📝 Episode number requested: ${episodeNumber}`);

      try {
        // Test if the URL exists by making a quick request
        const testResponse = await axios.get(directUrl, {
          headers: { 'User-Agent': this.USER_AGENT },
          timeout: 5000,
          validateStatus: (status) => status < 500 // Accept redirects and 404s
        });

        if (testResponse.status === 200) {
          const animeLink = directUrl;
          const animeId = titleSlug;
          console.log(`✅ Direct URL exists: ${animeLink}`);
          return { success: true, animeLink, animeId };
        } else {
          console.log(`❌ Direct URL returned status ${testResponse.status}: ${directUrl}`);
        }
      } catch (error) {
        console.log(`❌ Direct URL test failed: ${error.message}`);
      }

      console.log('🔍 Direct URL failed, searching 9anime with Cheerio...');

      const searchUrl = `${this.BASE_URL}/search?keyword=${encodeURIComponent(animeTitle)}`;

      const searchResponse = await axios.get(searchUrl, {
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 15000
      });

      const $ = cheerio.load(searchResponse.data);

      // 9anime specific selectors - prioritize episode URLs
      const selectors = [
        `a[href*="/${titleSlug}-episode-"]`,
        `a[href*="/${titleSlug}-film-"]`,
        `a[href*="/${titleSlug}-movie-"]`,
        'a[href*="/category/"]',
        'a[href*="/anime/"]',
        'a[href*="/v/"]',
        'a[href*="/watch/"]'
      ];

      let animeLink = '';

      // First, try to find exact matches with the anime title
      const exactSelectors = [
        `a[href*="/${titleSlug}-episode-"]`,
        `a[href*="/${titleSlug}-film-"]`,
        `a[href*="/${titleSlug}-movie-"]`,
        `a[href*="/anime/${titleSlug}/"]`, // 9anime anime page
        `a[href*="/${titleSlug}/"]` // Direct anime page
      ];

      for (const selector of exactSelectors) {
        const link = $(selector).first();
        if (link.length > 0) {
          animeLink = link.attr('href') || '';
          if (animeLink) {
            if (!animeLink.startsWith('http')) {
              animeLink = this.BASE_URL + animeLink;
            }

            // If we found an episode URL but it's not the right episode, construct the correct one
            if (animeLink.includes('-episode-') && episodeNumber !== 1) {
              const episodeMatch = animeLink.match(/-episode-(\d+)/);
              if (episodeMatch) {
                const foundEpisode = parseInt(episodeMatch[1]);
                if (foundEpisode !== episodeNumber) {
                  animeLink = animeLink.replace(`-episode-${foundEpisode}`, `-episode-${episodeNumber}`);
                  console.log(`🔄 Constructed correct episode URL: ${animeLink}`);
                }
              }
            } else if (!animeLink.includes('-episode-') && episodeNumber !== 1) {
              // If we found an anime page URL (not episode URL), construct the episode URL
              if (animeLink.includes('/anime/') || animeLink.includes('/category/')) {
                // Extract the anime slug from the URL
                const slugMatch = animeLink.match(/\/([^\/]+)\/?$/);
                if (slugMatch) {
                  const animeSlug = slugMatch[1];
                  animeLink = `${this.BASE_URL}/${animeSlug}-episode-${episodeNumber}/`;
                  console.log(`🔄 Constructed episode URL from anime page: ${animeLink}`);
                }
              }
            }

            console.log(`✅ Found exact match with selector: ${selector}`);
            break;
          }
        }
      }

      // If no exact match, try to find by text content with better matching
      if (!animeLink) {
        const allLinks = $('a[href*="/category/"], a[href*="/anime/"], a[href*="/v/"], a[href*="/watch/"]');
        console.log(`🔍 Searching through ${allLinks.length} links for "${animeTitle}"`);

        for (let i = 0; i < allLinks.length; i++) {
          const link = $(allLinks[i]);
          const linkText = link.text().toLowerCase().trim();
          const href = link.attr('href') || '';

          // More flexible text matching
          const titleWords = animeTitle.toLowerCase().split(' ').filter(word => word.length > 2);
          const linkWords = linkText.split(' ').filter(word => word.length > 2);

          // Check for partial matches
          const hasSignificantMatch = titleWords.some(titleWord =>
            linkWords.some(linkWord =>
              linkWord.includes(titleWord) || titleWord.includes(linkWord)
            )
          );

          // Also check if link text contains key parts of the title
          const hasKeyWords = titleWords.some(word =>
            linkText.includes(word) && word.length > 3
          );

          if (hasSignificantMatch || hasKeyWords) {
            animeLink = href;
            if (!animeLink.startsWith('http')) {
              animeLink = this.BASE_URL + animeLink;
            }
            console.log(`✅ Found by text match: "${linkText}" for "${animeTitle}"`);
            console.log(`   Match details: hasSignificantMatch=${hasSignificantMatch}, hasKeyWords=${hasKeyWords}`);
            break;
          }
        }
      }

      // If direct URL didn't work, try search-based approach
      if (!animeLink) {
        console.log('🔍 Direct URL failed, trying search-based approach...');

        // Fallback to first available link
        for (const selector of selectors) {
          const link = $(selector).first();
          if (link.length > 0) {
            animeLink = link.attr('href') || '';
            if (animeLink) {
              if (!animeLink.startsWith('http')) {
                animeLink = this.BASE_URL + animeLink;
              }
              console.log(`⚠️ Using fallback selector: ${selector}`);
              break;
            }
          }
        }
      }

      if (!animeLink) {
        return { success: false, error: 'No anime links found in 9anime search results' };
      }

      // Extract anime ID from 9anime URL format
      let animeId = animeLink.match(/\/([^\/]+)-episode-\d+/)?.[1] ||
                    animeLink.match(/\/([^\/]+)-film-/)?.[1] ||
                    animeLink.match(/\/([^\/]+)-movie-/)?.[1] ||
                    animeLink.match(/category\/([^?\/]+)/)?.[1] ||
                    animeLink.match(/anime\/([^?\/]+)/)?.[1] ||
                    animeLink.match(/v\/([^?\/]+)/)?.[1] ||
                    animeLink.match(/watch\/([^?\/]+)/)?.[1] ||
                    '9anime-' + Date.now(); // Fallback ID

      // If we found an anime page but not an episode page, construct episode URL
      if (animeLink.includes('/anime/') && !animeLink.includes('-episode-')) {
        // Convert anime page URL to episode URL
        animeLink = `${this.BASE_URL}/${animeId}-episode-1/`;
        console.log('🔄 Converted anime page to episode URL:', animeLink);
      }

      console.log('✅ 9anime search successful:', { animeLink, animeId });
      const result = { success: true, animeLink, animeId };
      try { await cacheSet(`search:${animeTitle}:${episodeNumber}`, result, 60_000); } catch {}
      return result;

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async extractVideoWithPuppeteer(animeLink, animeId, episodeNumber, options) {
    // Cache extracted stream briefly
    try {
      const cached = await cacheGet(`stream:${animeId}:${episodeNumber}`);
      if (cached) return cached;
    } catch {}
    let browser;
    let context;

    try {
      console.log('🎥 Extracting video with Puppeteer from 9anime...');

      browser = await getBrowser();
      if (!browser) {
        throw new Error('Failed to initialize browser');
      }

      // Verify browser has newContext method
      if (typeof browser.newContext !== 'function') {
        throw new Error(`Browser instance does not have newContext method. Browser type: ${typeof browser}, has newContext: ${'newContext' in browser}`);
      }

      try {
        context = await browser.newContext({
          userAgent: this.USER_AGENT,
          viewport: { width: 1280, height: 720 },
          bypassCSP: true,
          javaScriptEnabled: true,
          extraHTTPHeaders: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
          }
        });

        if (!context) {
          throw new Error('browser.newContext() returned null/undefined');
        }
      } catch (contextError) {
        console.error('❌ Failed to create browser context:', contextError);
        throw new Error(`Failed to create browser context: ${contextError.message}`);
      }

      const page = await context.newPage();

      // Navigate to the anime page with minimal timeout
      try {
        await page.goto(animeLink, { waitUntil: 'domcontentloaded', timeout: 10000 });
        console.log('✅ Page loaded successfully');
      } catch (gotoError) {
        console.log('⚠️ Page goto failed, trying with load event...');
        try {
          await page.goto(animeLink, { waitUntil: 'load', timeout: 5000 });
          console.log('✅ Page loaded with load event');
        } catch (loadError) {
          console.log('⚠️ Page load also failed, continuing anyway...');
        }
      }

      // Wait briefly for any dynamic content
      await page.waitForTimeout(2000);

      // Try to find iframe elements (this is what we want!)
      let streamUrl = '';

      // Method 1: Look for 9anime specific video containers
      try {
        // 9anime usually has video players in specific containers
        const videoContainers = [
          '.player-embed iframe',
          '.player iframe',
          '.video-player iframe',
          '#player iframe',
          '.anime-video iframe',
          'iframe[src*="embed"]',
          'iframe[src*="player"]',
          'iframe'
        ];

        for (const selector of videoContainers) {
          try {
            const iframe = await page.$(selector);
            if (iframe) {
              const src = await iframe.getAttribute('src');
              if (src && src.includes('https')) {
                streamUrl = src;
                console.log('✅ Found 9anime iframe:', streamUrl);

                // If Mega is already on the main page, use it directly (no further navigation)
                if (src.match(/mega(play|cloud|backup|cdn|stream)/i)) {
                  console.log('🎯 Using Mega URL directly from main page:', src);
                  break;
                }

                // If it's a gogoanime URL, try to get the actual video source
                if (src.includes('gogoanime.me.uk') || src.includes('gogoanime')) {
                  console.log('🔍 Found gogoanime URL, extracting megaplay source...');
                  
                  // Method 1: Try to fetch gogoanime page and extract megaplay URL
                  try {
                    console.log('📥 Fetching gogoanime page:', src);
                    const gogoResponse = await axios.get(src, {
                      headers: { 
                        'User-Agent': this.USER_AGENT,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Referer': 'https://9anime.org.lv/',
                      },
                      timeout: 15000,
                      maxRedirects: 5
                    });

                    const gogoHtml = gogoResponse.data;
                    console.log('📄 Gogoanime HTML length:', gogoHtml.length);

                    // Multiple patterns to find megaplay URL
                    const patterns = [
                      // Standard iframe src
                      /<iframe[^>]*src=["']([^"']*megaplay[^"']*)["']/gi,
                      // data-src attribute
                      /<iframe[^>]*data-src=["']([^"']*megaplay[^"']*)["']/gi,
                      // JavaScript variable assignments
                      /src\s*[=:]\s*["']([^"']*megaplay[^"']*)["']/gi,
                      // URL in quotes anywhere
                      /["']([^"']*megaplay\.buzz[^"']*)["']/gi,
                      // Broader pattern for any mega-related URL
                      /https?:\/\/[^"'\s]*megaplay[^"'\s]*/gi,
                    ];

                    for (const pattern of patterns) {
                      const matches = [...gogoHtml.matchAll(pattern)];
                      if (matches.length > 0) {
                        console.log(`🔍 Found ${matches.length} matches with pattern:`, pattern.toString().substring(0, 50));
                        for (const match of matches) {
                          const url = match[1] || match[0];
                          if (url && url.startsWith('http') && url.match(/mega(play|cloud|backup|cdn|stream)/i)) {
                            streamUrl = url.replace(/["']/g, '').trim();
                            console.log('✅ Found MEGA URL:', streamUrl);
                            break;
                          }
                        }
                        if (streamUrl && streamUrl.match(/mega(play|cloud|backup|cdn|stream)/i)) break;
                      }
                    }

                    // Additional fallback: Look for any video player iframe
                    if (!streamUrl || !streamUrl.includes('megaplay')) {
                      const anyIframeMatch = gogoHtml.match(/<iframe[^>]*src=["']([^"']*(?:player|embed|stream)[^"']*)["']/i);
                      if (anyIframeMatch && anyIframeMatch[1]) {
                        streamUrl = anyIframeMatch[1];
                        console.log('✅ Found alternative video player:', streamUrl);
                      }
                    }

                  } catch (fetchErr) {
                    console.log('⚠️ Failed to fetch gogoanime page:', fetchErr.message);
                  }

                  // Method 2: Try using Playwright to navigate to gogoanime page
                  if (!streamUrl || !streamUrl.match(/mega(play|cloud|backup|cdn|stream)/i)) {
                    try {
                      console.log('🌐 Trying Playwright navigation to gogoanime...');
                      const innerFrame = await iframe.contentFrame();
                      if (innerFrame) {
                        // Wait for nested iframes
                        await innerFrame.waitForTimeout(3000);
                        
                        // Try to find any mega-related iframe
                        const iframeSelectors = [
                          'iframe[src*="megaplay"]',
                          'iframe[src*="megacloud"]',
                          'iframe[src*="megabackup"]',
                          'iframe[data-src*="mega"]',
                          'iframe[src*="embed"]',
                          'iframe'
                        ];

                        for (const selector of iframeSelectors) {
                          const nested = await innerFrame.$(selector).catch(() => null);
                          if (nested) {
                            let nestedSrc = await nested.getAttribute('src') || await nested.getAttribute('data-src');
                            if (!nestedSrc) {
                              nestedSrc = await nested.evaluate(el => el.src || el.getAttribute('data-src')).catch(() => null);
                            }
                            if (nestedSrc && (nestedSrc.match(/mega(play|cloud|backup|cdn|stream)/i) || nestedSrc.includes('embed'))) {
                              streamUrl = nestedSrc;
                              console.log('✅ Found video source via Playwright:', streamUrl);
                              break;
                            }
                          }
                        }
                      }
                    } catch (nestedErr) {
                      console.log('⚠️ Playwright navigation failed:', nestedErr.message);
                    }
                  }

                  // If we still don't have a mega URL, log what we found
                  if (streamUrl && !streamUrl.match(/mega(play|cloud|backup|cdn|stream)/i)) {
                    console.log('⚠️ Could not find mega URL, using:', streamUrl);
                  }
                }

                // If it's a 2anime URL, try to get the actual video source
                if (src.includes('2anime.xyz')) {
                  console.log('🔍 Found 2anime URL, extracting actual video source...');
                  try {
                    const animeResponse = await axios.get(src, {
                      headers: { 'User-Agent': this.USER_AGENT },
                      timeout: 10000
                    });

                    const animeHtml = animeResponse.data;

                    // Look for various video sources in 2anime pages (including all mega variants)
                    const videoPatterns = [
                      /<iframe[^>]+data-src=["']([^"']+)["'][^>]*>/i,
                      /<iframe[^>]+src=["']([^"']*mega(?:play|cloud|backup|cdn|stream)[^"']*)["'][^>]*>/i,
                      /<iframe[^>]+src=["']([^"']*stream[^"']*)["'][^>]*>/i,
                      /<iframe[^>]+src=["']([^"']*2m\.2anime[^"']*)["'][^>]*>/i,
                      /<video[^>]+src=["']([^"']*)["'][^>]*>/i,
                      /"file":"([^"]+)"/i,
                      /"url":"([^"]+)"/i
                    ];

                    for (const pattern of videoPatterns) {
                      const match = animeHtml.match(pattern);
                      if (match && match[1] && match[1].includes('http')) {
                        streamUrl = match[1];
                        console.log('✅ Found actual video source from 2anime:', streamUrl);
                        break;
                      }
                    }
                  } catch (e) {
                    console.log('⚠️ Could not extract video source from 2anime:', e.message);
                  }
                }

                break;
              }
            }
          } catch (e) {
            // Continue to next selector
          }
        }
      } catch (e) {
        console.log('No 9anime iframe found, trying other methods...');
      }

      // Method 2: Look for video elements
      if (!streamUrl) {
        try {
          await page.waitForSelector('video', { timeout: 15000 });
          const videoSrc = await page.$eval('video', (el) => el.src);
          if (videoSrc) {
            streamUrl = videoSrc;
            console.log('✅ Found video source:', streamUrl);
          }
        } catch (e) {
          console.log('No video element found...');
        }
      }

      // Method 3: Extract from page content (9anime specific patterns)
      if (!streamUrl) {
        const pageContent = await page.content();
        console.log('🔍 Searching 9anime page content for video URLs...');

        // 9anime specific patterns
        const patterns = [
          /<iframe[^>]+src=["']([^"']*embed[^"']*)["'][^>]*>/gi,
          /<iframe[^>]+src=["']([^"']*player[^"']*)["'][^>]*>/gi,
          /iframe\.src\s*=\s*["']([^"']+)["']/gi,
          /data-src=["']([^"']*embed[^"']*)["']/gi,
          /src\s*:\s*["']([^"']*embed[^"']*)["']/gi,
          /"url"\s*:\s*"([^"]*embed[^"]*)"/gi,
          /"src"\s*:\s*"([^"]*embed[^"]*)"/gi
        ];

        for (const pattern of patterns) {
          const matches = pageContent.match(pattern);
          if (matches && matches.length > 0) {
            console.log(`Found ${matches.length} matches with 9anime pattern`);
            for (const match of matches) {
              const url = match.replace(/<iframe[^>]+src=["']/, '').replace(/["'][^>]*>/, '')
                              .replace(/iframe\.src\s*=\s*["']/, '').replace(/["']/, '')
                              .replace(/data-src=["']/, '').replace(/["']/, '')
                              .replace(/src\s*:\s*["']/, '').replace(/["']/, '')
                              .replace(/"url"\s*:\s*"/, '').replace(/"/, '')
                              .replace(/"src"\s*:\s*"/, '').replace(/"/, '');

              if (url && url.includes('http') && (url.includes('embed') || url.includes('player'))) {
                streamUrl = url;
                console.log('✅ Found 9anime video URL in page content:', streamUrl);
                break;
              }
            }
            if (streamUrl) break;
          }
        }
      }

      // Method 4: Fallback - use the anime page URL as iframe source
      if (!streamUrl) {
        streamUrl = animeLink;
        console.log('⚠️ Using anime page URL as iframe source:', streamUrl);
      }

      // Always return success with iframe URL (even if it's just the page URL)
      console.log('🎉 Final 9anime URL:', streamUrl);
      console.log('🔍 DEBUG: streamUrl type:', typeof streamUrl, 'value:', streamUrl);
      console.log('🔍 DEBUG: Is mega URL?', streamUrl.match(/mega(play|cloud|backup|cdn|stream)/i) ? 'YES' : 'NO');

      if (context) {
        await context.close().catch(err => console.warn('Failed to close context:', err));
      }

      const payload = {
        success: true,
        streamUrl,
        episodeData: {
          animeId,
          extractedAt: new Date()
        }
      };
      console.log('📦 DEBUG: Returning payload with streamUrl:', payload.streamUrl);
      try { await cacheSet(`stream:${animeId}:${episodeNumber}`, payload, 120_000); } catch {}
      return payload;

    } catch (error) {
      console.error('❌ Error in extractVideoWithPuppeteer:', error.message);
      if (context) {
        await context.close().catch(err => console.warn('Failed to close context in catch:', err));
      }
      return { success: false, error: error.message };
    }
  }

  static async saveEpisodeToDatabase(episodeData) {
    try {
      console.log('💾 DEBUG: saveEpisodeToDatabase called with videoUrl:', episodeData.videoUrl);
      
      const dataToSave = {
        anime_id: episodeData.animeId,
        episode_number: episodeData.episodeNumber,
        title: episodeData.title,
        video_url: episodeData.videoUrl,
        thumbnail_url: episodeData.thumbnailUrl,
        duration: episodeData.duration,
        description: episodeData.description,
        created_at: episodeData.createdAt.toISOString(),
      };
      
      console.log('💾 DEBUG: Data being upserted:', JSON.stringify(dataToSave, null, 2));
      
      const { error } = await supabase.from('episodes').upsert(
        dataToSave,
        { onConflict: ['anime_id', 'episode_number'] }
      );

      if (error) {
        console.error('❌ DB Error:', error.message);
        return { success: false, error: error.message };
      }
      console.log('🎉 Stream saved to Supabase with URL:', episodeData.videoUrl);
      return { success: true };
    } catch (error) {
      console.error('❌ Save Error:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async scrapeAndSaveEpisode(animeTitle, animeId, episodeNumber = 1, options = {}) {
    try {
      const scrapeResult = await this.scrapeAnimeEpisode(animeTitle, episodeNumber, options);
      console.log('🔍 DEBUG: scrapeResult.streamUrl:', scrapeResult.streamUrl);

      if (scrapeResult.success && scrapeResult.streamUrl) {
        const episodeData = {
          animeId: animeId,
          episodeNumber: episodeNumber,
          title: `${animeTitle} - Episode ${episodeNumber}`,
          videoUrl: scrapeResult.streamUrl,
          thumbnailUrl: `https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bd${animeId}-5n5yZ6K1J1oH.jpg`,
          duration: 1440, // Default to 24 mins
          description: `Episode ${episodeNumber} of ${animeTitle}`,
          createdAt: new Date(),
        };
        console.log('💾 DEBUG: Saving to database with videoUrl:', episodeData.videoUrl);

        const saveResult = await this.saveEpisodeToDatabase(episodeData);

        if (saveResult.success) {
          return {
            success: true,
            streamUrl: scrapeResult.streamUrl,
            episodeData: episodeData
          };
        } else {
          return {
            success: false,
            error: saveResult.error
          };
        }
      } else {
        return scrapeResult;
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Health check endpoint
// Health check endpoints (use new handlers)
app.get('/health', getHealthHandler());
app.get('/api/health', getDetailedHealthHandler(supabase, redis));

// Legacy health endpoint (remove if needed)
app.get('/health-old', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: '9anime Scraper API'
  });
});

// Single episode scraping endpoint
app.post('/api/scrape-episode', async (req, res) => {
  try {
    const { animeTitle, animeId, episodeNumber = 1, options = {} } = req.body;

    if (!animeTitle || !animeId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: animeTitle and animeId'
      });
    }

    console.log(`🎬 API: Scraping episode ${episodeNumber} for "${animeTitle}" (ID: ${animeId})`);

    const result = await NineAnimeScraperService.scrapeAndSaveEpisode(
      animeTitle,
      animeId,
      episodeNumber,
      {
        timeout: 45000,
        retries: 3,
        ...options
      }
    );

    if (result.success) {
      res.json({
        success: true,
        streamUrl: result.streamUrl,
        episodeData: result.episodeData,
        message: `Episode ${episodeNumber} scraped and saved successfully!`
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Scraping failed'
      });
    }

  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// Test gogoanime URL extraction
app.post('/api/test-gogoanime-extract', async (req, res) => {
  try {
    const { gogoanimeUrl } = req.body;
    
    if (!gogoanimeUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'gogoanimeUrl is required' 
      });
    }

    console.log('🔍 Testing gogoanime URL extraction:', gogoanimeUrl);

    const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    // Fetch the gogoanime page
    const response = await axios.get(gogoanimeUrl, {
      headers: { 
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://9anime.org.lv/',
      },
      timeout: 15000,
      maxRedirects: 5
    });

    const html = response.data;
    console.log('✅ Page fetched, HTML length:', html.length);

    // Extract all potential video URLs
    const results = {
      megaUrls: [], // All mega variants (megaplay, megacloud, etc.)
      allIframeUrls: [],
      otherVideoUrls: []
    };

    // Pattern 1: ALL Mega URLs (megaplay, megacloud, megabackup, etc.)
    const megaPattern = /https?:\/\/[^"'\s]*mega(?:play|cloud|backup|cdn|stream|\.)[^"'\s]*/gi;
    const megaMatches = [...html.matchAll(megaPattern)];
    results.megaUrls = [...new Set(megaMatches.map(m => m[0].replace(/["']/g, '').trim()))];

    // Pattern 2: All iframe src
    const iframePattern = /<iframe[^>]*src=["']([^"']+)["']/gi;
    const iframeMatches = [...html.matchAll(iframePattern)];
    results.allIframeUrls = [...new Set(iframeMatches.map(m => m[1]))];

    // Pattern 3: Video/player/embed URLs
    const videoPattern = /https?:\/\/[^"'\s]*(?:player|embed|stream|video)[^"'\s]*/gi;
    const videoMatches = [...html.matchAll(videoPattern)];
    results.otherVideoUrls = [...new Set(videoMatches.map(m => m[0].replace(/["']/g, '').trim()))];

    console.log('📊 Found:', {
      megaUrls: results.megaUrls.length,
      iframes: results.allIframeUrls.length,
      videos: results.otherVideoUrls.length
    });

    res.json({
      success: true,
      url: gogoanimeUrl,
      htmlLength: html.length,
      results,
      recommended: results.megaUrls[0] || results.allIframeUrls.find(u => u.match(/mega(play|cloud|backup|cdn|stream)/i)) || results.allIframeUrls[0]
    });

  } catch (error) {
    console.error('❌ Extraction Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.status ? `HTTP ${error.response.status}` : 'Request failed'
    });
  }
});

// Test scraper endpoint
app.post('/api/test-scraper', async (req, res) => {
  try {
    console.log('🧪 API: Testing scraper...');

    const { animeTitle = 'One Piece', episodeNumber = 1 } = req.body;
    console.log(`🎬 Testing with anime: "${animeTitle}", Episode ${episodeNumber}`);

    const result = await NineAnimeScraperService.scrapeAnimeEpisode(animeTitle, episodeNumber, {
      timeout: 30000,
      retries: 2
    });

    res.json({
      success: result.success,
      message: result.success ? 'Scraper test successful!' : 'Scraper test failed',
      details: result
    });

  } catch (error) {
    console.error('❌ Test Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Test failed'
    });
  }
});

// Scrape all episodes endpoint
app.post('/api/scrape-all-episodes', async (req, res) => {
  try {
    console.log('🎬 API: Scraping all episodes...');

    const { animeTitle, animeId, maxEpisodes = 20 } = req.body;

    if (!animeTitle) {
      return res.status(400).json({
        success: false,
        error: 'Anime title is required'
      });
    }

    if (!animeId) {
      return res.status(400).json({
        success: false,
        error: 'Anime ID is required'
      });
    }

    console.log(`🎬 Scraping all episodes for: "${animeTitle}" (max ${maxEpisodes})`);

    const result = await NineAnimeScraperService.scrapeAllEpisodes(animeTitle, {
      animeId,
      maxEpisodes,
      timeout: 60000, // 1 minute total
      retries: 2
    });

    res.json({
      success: result.success,
      message: result.success ? 'All episodes scraped successfully!' : 'Failed to scrape episodes',
      data: result
    });

  } catch (error) {
    console.error('❌ Scrape all episodes error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Batch scrape episodes endpoint
app.post('/api/batch-scrape-episodes', async (req, res) => {
  try {
    console.log('🎬 API: Batch scraping episodes...');

    const { animeTitle, animeId, episodeNumbers, options = {} } = req.body;

    if (!animeTitle || !animeId || !episodeNumbers) {
      return res.status(400).json({
        success: false,
        error: 'Anime title, ID, and episode numbers are required'
      });
    }

    console.log(`🎬 Batch scraping ${episodeNumbers.length} episodes for: "${animeTitle}"`);

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Scrape each episode
    for (const episodeNumber of episodeNumbers) {
      try {
        console.log(`📺 Scraping episode ${episodeNumber}...`);

        // Use the existing scrape episode logic
        const scrapeResult = await NineAnimeScraperService.scrapeAnimeEpisode(
          animeTitle,
          episodeNumber,
          {
            timeout: options.timeout || 30000,
            retries: options.retries || 2
          }
        );

        if (scrapeResult.success && scrapeResult.streamUrl) {
          successCount++;
          results.push({
            episode: episodeNumber,
            status: 'success',
            url: scrapeResult.streamUrl,
            title: scrapeResult.episodeData?.title || `Episode ${episodeNumber}`,
            embeddingProtected: scrapeResult.embeddingProtected || false,
            embeddingReason: scrapeResult.embeddingReason || null,
            scrapedAt: new Date().toISOString()
          });

        } else {
          throw new Error(scrapeResult.error || 'Scraping failed');
        }

      } catch (error) {
        console.error(`❌ Episode ${episodeNumber} failed:`, error.message);
        errorCount++;
        results.push({
          episode: episodeNumber,
          status: 'failed',
          error: error.message
        });
      }

      // Add delay between episodes
      if (episodeNumber < episodeNumbers[episodeNumbers.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, options.delayBetweenEpisodes || 2000));
      }
    }

    const successRate = episodeNumbers.length > 0 ? (successCount / episodeNumbers.length) * 100 : 0;

    console.log(`✅ Batch scraping completed: ${successCount}/${episodeNumbers.length} episodes successful`);

    res.json({
      success: true,
      message: `Batch scraping completed: ${successCount}/${episodeNumbers.length} episodes successful`,
      results,
      summary: {
        totalEpisodes: episodeNumbers.length,
        successCount,
        errorCount,
        successRate: Math.round(successRate * 10) / 10
      }
    });

  } catch (error) {
    console.error('❌ Batch scrape error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Optimized anime list endpoints with Redis caching
// Featured anime (highest rated)
app.get('/api/anime/featured', cacheMiddleware(300_000), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '5', 10);
    const { data, error } = await supabase
      .from('anime')
      .select('*')
      .gte('rating', 8.0)
      .order('rating', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Featured anime error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Featured anime error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Trending anime (recently added with good rating)
app.get('/api/anime/trending', cacheMiddleware(300_000), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '10', 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('anime')
      .select('*')
      .gte('created_at', thirtyDaysAgo)
      .gte('rating', 7.0)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Trending anime error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Fallback if not enough data
    if (!data || data.length < limit) {
      const { data: fallbackData } = await supabase
        .from('anime')
        .select('*')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(limit);

      return res.json({ success: true, data: fallbackData || [] });
    }

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Trending anime error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Popular anime (highest rated)
app.get('/api/anime/popular', cacheMiddleware(300_000), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '12', 10);
    const { data, error } = await supabase
      .from('anime')
      .select('*')
      .not('rating', 'is', null)
      .order('rating', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Popular anime error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Popular anime error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Recent anime (newest first)
app.get('/api/anime/recent', cacheMiddleware(120_000), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '6', 10);
    const { data, error } = await supabase
      .from('anime')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Recent anime error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Recent anime error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get episodes for an anime
app.get('/api/anime/:animeId/episodes', cacheMiddleware(30_000), async (req, res) => {
  try {
    const { animeId } = req.params;
    console.log('🔍 API: Getting episodes for anime ID:', animeId);

    const { data: episodes, error } = await supabase
      .from('episodes')
      .select('episode_number, title, video_url, created_at')
      .eq('anime_id', animeId)
      .order('episode_number');

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    console.log('✅ Found episodes:', episodes?.length || 0);
    res.json({
      success: true,
      episodes: episodes || []
    });

  } catch (error) {
    console.error('❌ Error getting episodes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add scraped episode to database endpoint
app.post('/api/add-scraped-episode', async (req, res) => {
  try {
    console.log('💾 API: Adding scraped episode to database...');

    const { animeId, episodeData } = req.body;

    if (!animeId || !episodeData) {
      return res.status(400).json({
        success: false,
        error: 'Anime ID and episode data are required'
      });
    }

    // Check if episode already exists
    const { data: existingEpisode, error: checkError } = await supabase
      .from('episodes')
      .select('id')
      .eq('anime_id', animeId)
      .eq('episode_number', episodeData.number)
      .maybeSingle(); // Use maybeSingle() to avoid errors when no record found

    let data, error;

    if (existingEpisode && !checkError) {
      // Episode exists, update it
      console.log(`📝 Updating existing episode ${episodeData.number} for anime ${animeId}`);
      const updateResult = await supabase
        .from('episodes')
        .update({
          title: episodeData.title,
          video_url: episodeData.streamUrl,
          description: `Scraped from 9anime.org.lv - ${episodeData.embeddingProtected ? 'May have embedding protection' : 'Embedding friendly'}`
        })
        .eq('anime_id', animeId)
        .eq('episode_number', episodeData.number)
        .select()
        .single();

      data = updateResult.data;
      error = updateResult.error;
    } else {
      // Episode doesn't exist, insert it
      console.log(`➕ Inserting new episode ${episodeData.number} for anime ${animeId}`);
      const insertResult = await supabase
        .from('episodes')
        .insert({
          anime_id: animeId,
          episode_number: episodeData.number,
          title: episodeData.title,
          video_url: episodeData.streamUrl,
          duration: null,
          thumbnail_url: null,
          description: `Scraped from 9anime.org.lv - ${episodeData.embeddingProtected ? 'May have embedding protection' : 'Embedding friendly'}`,
          is_premium: false
        })
        .select()
        .single();

      data = insertResult.data;
      error = insertResult.error;
    }

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    console.log(`✅ Episode ${episodeData.number} ${existingEpisode ? 'updated' : 'added'} to database`);

    res.json({
      success: true,
      message: `Episode ${episodeData.number} ${existingEpisode ? 'updated' : 'added'} successfully!`,
      episode: data
    });

  } catch (error) {
    console.error('❌ Add episode error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start large anime scraping job
app.post('/api/start-large-scrape', async (req, res) => {
  try {
    console.log('🎬 API: Starting large anime scraping job...');

    const { animeId, animeTitle, totalEpisodes, chunkSize = 50 } = req.body;

    if (!animeId || !animeTitle || !totalEpisodes) {
      return res.status(400).json({
        success: false,
        error: 'Anime ID, title, and total episodes are required'
      });
    }

    // Calculate chunks
    const totalChunks = Math.ceil(totalEpisodes / chunkSize);

    // Create or update scraping progress
    const { data: progressData, error: progressError } = await supabase
      .from('scraping_progress')
      .upsert({
        anime_id: animeId,
        anime_title: animeTitle,
        total_episodes: totalEpisodes,
        completed_episodes: 0,
        failed_episodes: 0,
        current_chunk: 1,
        total_chunks: totalChunks,
        chunk_size: chunkSize,
        status: 'in_progress',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'anime_id'
      })
      .select()
      .single();

    if (progressError) {
      throw new Error(`Database error: ${progressError.message}`);
    }

    // Create episode log entries for all episodes
    const episodeLogs = [];
    for (let episode = 1; episode <= totalEpisodes; episode++) {
      const chunkNumber = Math.ceil(episode / chunkSize);
      episodeLogs.push({
        scraping_progress_id: progressData.id,
        episode_number: episode,
        chunk_number: chunkNumber,
        status: 'pending',
        created_at: new Date().toISOString()
      });
    }

    const { error: logError } = await supabase
      .from('episode_scraping_log')
      .upsert(episodeLogs, {
        onConflict: 'scraping_progress_id,episode_number'
      });

    if (logError) {
      console.warn('Warning: Could not create episode logs:', logError.message);
    }

    console.log(`✅ Large scraping job started: ${animeTitle} (${totalEpisodes} episodes, ${totalChunks} chunks)`);

    res.json({
      success: true,
      message: `Large scraping job started for ${animeTitle}`,
      jobId: progressData.id,
      totalEpisodes,
      totalChunks,
      chunkSize
    });

  } catch (error) {
    console.error('❌ Start large scrape error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get scraping progress
app.get('/api/scraping-progress/:animeId', cacheMiddleware(15_000), async (req, res) => {
  try {
    const { animeId } = req.params;

    const { data: progress, error } = await supabase
      .from('scraping_progress')
      .select(`
        *,
        episode_scraping_log (
          episode_number,
          status,
          error_message,
          scraped_at
        )
      `)
      .eq('anime_id', animeId)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        error: 'Scraping progress not found'
      });
    }

    // Calculate progress percentage
    const progressPercentage = progress.total_episodes > 0 
      ? Math.round((progress.completed_episodes / progress.total_episodes) * 100)
      : 0;

    // Estimate time remaining
    const startedAt = new Date(progress.started_at);
    const now = new Date();
    const elapsedMs = now - startedAt;
    const episodesPerMs = progress.completed_episodes / elapsedMs;
    const remainingEpisodes = progress.total_episodes - progress.completed_episodes;
    const estimatedMsRemaining = episodesPerMs > 0 ? remainingEpisodes / episodesPerMs : 0;

    const estimatedTimeRemaining = estimatedMsRemaining > 0 
      ? formatDuration(estimatedMsRemaining)
      : 'Calculating...';

    res.json({
      success: true,
      progress: {
        ...progress,
        progressPercentage,
        estimatedTimeRemaining,
        episodesPerMs: episodesPerMs * 1000 // episodes per second
      }
    });

  } catch (error) {
    console.error('❌ Get progress error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Scrape a single chunk
app.post('/api/scrape-chunk', async (req, res) => {
  try {
    console.log('🎬 API: Scraping chunk...');

    const { animeId, animeTitle, chunkNumber, chunkSize = 50, progressId } = req.body;

    if (!animeId || !animeTitle || chunkNumber === undefined || !progressId) {
      return res.status(400).json({
        success: false,
        error: 'Anime ID, title, chunk number, and progress ID are required'
      });
    }

    // Get episodes to scrape from log
    const { data: episodesToScrape, error: logError } = await supabase
      .from('episode_scraping_log')
      .select('episode_number')
      .eq('scraping_progress_id', progressId)
      .eq('chunk_number', chunkNumber)
      .in('status', ['pending', 'failed']);

    if (logError) {
      throw new Error(`Database error: ${logError.message}`);
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Scrape each episode in the chunk
    for (const episodeLog of episodesToScrape) {
      const episodeNumber = episodeLog.episode_number;

      try {
        // Update status to scraping
        await supabase
          .from('episode_scraping_log')
          .update({ status: 'scraping' })
          .eq('scraping_progress_id', progressId)
          .eq('episode_number', episodeNumber);

        // Scrape the episode
        const scrapeResult = await NineAnimeScraperService.scrapeAnimeEpisode(
          animeTitle,
          episodeNumber,
          {
            timeout: 30000,
            retries: 2
          }
        );

        if (scrapeResult.success && scrapeResult.streamUrl) {
          // Save to database
          const { error: saveError } = await supabase
            .from('episodes')
            .upsert({
              anime_id: animeId,
              episode_number: episodeNumber,
              title: scrapeResult.episodeData?.title || `Episode ${episodeNumber}`,
              video_url: scrapeResult.streamUrl,
              description: `Scraped from 9anime - Chunk ${chunkNumber}`,
              is_premium: false
            }, {
              onConflict: 'anime_id,episode_number'
            });

          if (saveError) {
            throw new Error(`Database save error: ${saveError.message}`);
          }

          // Update log to success
          await supabase
            .from('episode_scraping_log')
            .update({ 
              status: 'success',
              video_url: scrapeResult.streamUrl,
              scraped_at: new Date().toISOString()
            })
            .eq('scraping_progress_id', progressId)
            .eq('episode_number', episodeNumber);

          successCount++;
          results.push({ episode: episodeNumber, status: 'success', url: scrapeResult.streamUrl });

        } else {
          throw new Error(scrapeResult.error || 'Scraping failed');
        }

      } catch (error) {
        console.error(`❌ Episode ${episodeNumber} failed:`, error.message);

        // Update log to failed
        await supabase
          .from('episode_scraping_log')
          .update({ 
            status: 'failed',
            error_message: error.message
          })
          .eq('scraping_progress_id', progressId)
          .eq('episode_number', episodeNumber);

        errorCount++;
        results.push({ episode: episodeNumber, status: 'failed', error: error.message });
      }

      // Add delay between episodes to avoid being blocked
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Update overall progress
    const { error: updateError } = await supabase
      .from('scraping_progress')
      .update({
        completed_episodes: supabase.raw('completed_episodes + ?', [successCount]),
        failed_episodes: supabase.raw('failed_episodes + ?', [errorCount]),
        current_chunk: chunkNumber + 1,
        updated_at: new Date().toISOString()
      })
      .eq('anime_id', animeId);

    if (updateError) {
      console.warn('Warning: Could not update progress:', updateError.message);
    }

    console.log(`✅ Chunk ${chunkNumber} completed: ${successCount} success, ${errorCount} failed`);

    res.json({
      success: true,
      message: `Chunk ${chunkNumber} completed`,
      results,
      summary: {
        totalEpisodes: episodesToScrape.length,
        successCount,
        errorCount,
        successRate: episodesToScrape.length > 0 ? (successCount / episodesToScrape.length) * 100 : 0
      }
    });

  } catch (error) {
    console.error('❌ Scrape chunk error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Image proxy endpoint to bypass CORS restrictions
app.get('/api/image-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL parameter is required' 
      });
    }

    // Validate URL
    let imageUrl;
    try {
      imageUrl = new URL(url);
    } catch {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid URL provided' 
      });
    }

    // Security: Only allow HTTPS and common image hosting domains
    if (imageUrl.protocol !== 'https:') {
      return res.status(400).json({ 
        success: false, 
        error: 'Only HTTPS URLs are allowed' 
      });
    }

    console.log('🖼️ Proxying image:', url);

    // Check cache first
    const cacheKey = `img:${url}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      console.log('✅ Image from cache');
      const buffer = Buffer.from(cached.data, 'base64');
      res.set({
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=86400', // 24 hours
        'X-Cache': 'HIT'
      });
      return res.send(buffer);
    }

    // Fetch the image
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': imageUrl.origin,
      },
      timeout: 10000,
      maxContentLength: 10 * 1024 * 1024, // 10MB max
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    const buffer = Buffer.from(response.data);

    // Cache the image (convert to base64 for storage)
    try {
      await cacheSet(cacheKey, {
        data: buffer.toString('base64'),
        contentType
      }, 24 * 60 * 60 * 1000); // Cache for 24 hours
    } catch (cacheErr) {
      console.warn('Failed to cache image:', cacheErr.message);
    }

    // Set appropriate headers
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400', // 24 hours
      'X-Cache': 'MISS',
      'Access-Control-Allow-Origin': '*',
    });

    res.send(buffer);

  } catch (error) {
    console.error('❌ Image proxy error:', error.message);
    
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return res.status(504).json({ 
        success: false, 
        error: 'Image request timed out' 
      });
    }
    
    if (error.response) {
      return res.status(error.response.status).json({ 
        success: false, 
        error: `Failed to fetch image: ${error.response.statusText}` 
      });
    }

    res.status(500).json({ 
      success: false, 
      error: 'Failed to proxy image' 
    });
  }
});

// Helper function to format duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// Error handling middleware (must be after all routes)
app.use(errorHandler);

// 404 handler (must be last)
app.use(notFoundHandler);

app.listen(PORT, () => {
  console.log(`🚀 9anime Scraper API running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🎬 Scraper endpoints:`);
  console.log(`   POST /api/scrape-episode`);
  console.log(`   POST /api/test-scraper`);
  console.log(`   POST /api/scrape-all-episodes`);
  console.log(`   POST /api/batch-scrape-episodes`);
  console.log(`   POST /api/start-large-scrape`);
  console.log(`   POST /api/scrape-chunk`);
  console.log(`   GET  /api/scraping-progress/:animeId`);
});

export default app;