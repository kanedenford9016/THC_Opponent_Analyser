"""Storage layer with SQLite caching."""

import sqlite3
import json
import time
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timedelta
from thc_edge.config import Config
from thc_edge.logging_setup import setup_logging


logger = setup_logging(__name__)


class Cache:
    """SQLite-based cache for API responses and computed features."""
    
    def __init__(self, db_path: Optional[Path] = None, session_only: bool = False):
        """
        Initialize cache.
        
        Args:
            db_path: Path to SQLite database file
            session_only: If True, only cache API responses in memory for this session
        """
        self.db_path = db_path or Config.CACHE_DB_PATH
        self._memory_cache: Dict[Tuple[str, str], Tuple[Dict, float, int]] = {}
        self.session_only = session_only
        self._init_db()
    
    def _init_db(self) -> None:
        """Initialize database tables."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        if self.session_only:
            return None

        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        # API responses cache
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS api_cache (
                id INTEGER PRIMARY KEY,
                player_id TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                response_data TEXT NOT NULL,
                created_at REAL NOT NULL,
                ttl_seconds INTEGER DEFAULT 3600,
                UNIQUE(player_id, endpoint)
            )
        """)
        
        # Player features cache
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS player_features (
                id INTEGER PRIMARY KEY,
                player_id TEXT NOT NULL UNIQUE,
                raw_stats TEXT NOT NULL,
                normalized_features TEXT NOT NULL,
                main_stat TEXT,
                behavioral_style TEXT,
                last_seen REAL NOT NULL,
                created_at REAL NOT NULL
            )
        """)
        
        # Timestamps
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS player_metadata (
                id INTEGER PRIMARY KEY,
                player_id TEXT NOT NULL UNIQUE,
                first_seen REAL NOT NULL,
                last_seen REAL NOT NULL,
                fetch_count INTEGER DEFAULT 1
            )
        """)
        
        conn.commit()
        conn.close()
        logger.debug(f"Initialized cache database at {self.db_path}")
    
    def get_cached_response(self, player_id: str, endpoint: str) -> Optional[Dict]:
        """
        Get cached API response if available and not expired.
        
        Args:
            player_id: Player identifier
            endpoint: API endpoint name
        
        Returns:
            Cached response data or None if expired/not found
        """
        memory_key = (player_id, endpoint)
        if memory_key in self._memory_cache:
            data, created_at, ttl_seconds = self._memory_cache[memory_key]
            elapsed = time.time() - created_at
            if elapsed <= ttl_seconds:
                logger.debug(f"Memory cache hit for {player_id} @ {endpoint} (age: {elapsed:.1f}s)")
                return data
            logger.debug(f"Memory cache expired for {player_id} @ {endpoint}")
            del self._memory_cache[memory_key]

        if self.session_only:
            return None

        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT response_data, created_at, ttl_seconds
            FROM api_cache
            WHERE player_id = ? AND endpoint = ?
        """, (player_id, endpoint))
        
        result = cursor.fetchone()
        conn.close()
        
        if not result:
            return None
        
        response_data, created_at, ttl_seconds = result
        elapsed = time.time() - created_at
        
        if elapsed > ttl_seconds:
            logger.debug(f"Cache expired for {player_id} @ {endpoint}")
            self.delete_cached_response(player_id, endpoint)
            return None
        
        logger.debug(f"Cache hit for {player_id} @ {endpoint} (age: {elapsed:.1f}s)")
        data = json.loads(response_data)
        self._memory_cache[memory_key] = (data, created_at, ttl_seconds)
        return data
    
    def cache_response(self, player_id: str, endpoint: str, data: Dict, ttl_seconds: Optional[int] = None) -> None:
        """
        Cache API response.
        
        Args:
            player_id: Player identifier
            endpoint: API endpoint name
            data: Response data
            ttl_seconds: Time to live for this cache entry
        """
        ttl = ttl_seconds or Config.CACHE_TTL_SECONDS
        self._memory_cache[(player_id, endpoint)] = (data, time.time(), ttl)

        if self.session_only:
            return

        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT OR REPLACE INTO api_cache
            (player_id, endpoint, response_data, created_at, ttl_seconds)
            VALUES (?, ?, ?, ?, ?)
        """, (player_id, endpoint, json.dumps(data), time.time(), ttl))
        
        conn.commit()
        conn.close()
        logger.debug(f"Cached response for {player_id} @ {endpoint}")
    
    def delete_cached_response(self, player_id: str, endpoint: str) -> None:
        """Delete cached response."""
        memory_key = (player_id, endpoint)
        if memory_key in self._memory_cache:
            del self._memory_cache[memory_key]
        if self.session_only:
            return

        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute("""
            DELETE FROM api_cache
            WHERE player_id = ? AND endpoint = ?
        """, (player_id, endpoint))
        conn.commit()
        conn.close()
    
    def save_player_features(
        self,
        player_id: str,
        raw_stats: Dict,
        normalized_features: Dict,
        main_stat: Optional[str] = None,
        behavioral_style: Optional[str] = None
    ) -> None:
        """
        Save computed player features.
        
        Args:
            player_id: Player identifier
            raw_stats: Raw stat dictionary
            normalized_features: Normalized feature dictionary
            main_stat: Main stat name
            behavioral_style: Behavioral style classification
        """
        now = time.time()
        
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT OR REPLACE INTO player_features
            (player_id, raw_stats, normalized_features, main_stat, behavioral_style, last_seen, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            player_id,
            json.dumps(raw_stats),
            json.dumps(normalized_features),
            main_stat,
            behavioral_style,
            now,
            now
        ))
        
        conn.commit()
        conn.close()
        logger.debug(f"Saved features for player {player_id}")
    
    def get_player_features(self, player_id: str) -> Optional[Dict]:
        """
        Get saved player features.
        
        Args:
            player_id: Player identifier
        
        Returns:
            Features dictionary or None
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT raw_stats, normalized_features, main_stat, behavioral_style, last_seen
            FROM player_features
            WHERE player_id = ?
        """, (player_id,))
        
        result = cursor.fetchone()
        conn.close()
        
        if not result:
            return None
        
        raw_stats, norm_feats, main_stat, style, last_seen = result
        
        return {
            "player_id": player_id,
            "raw_stats": json.loads(raw_stats),
            "normalized_features": json.loads(norm_feats),
            "main_stat": main_stat,
            "behavioral_style": style,
            "last_seen": last_seen
        }
    
    def get_all_player_ids(self) -> List[str]:
        """Get list of all cached player IDs."""
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        cursor.execute("SELECT DISTINCT player_id FROM player_features")
        player_ids = [row[0] for row in cursor.fetchall()]
        
        conn.close()
        return player_ids
    
    def clear_expired(self) -> None:
        """Remove expired cache entries."""
        now = time.time()
        expired_keys = [
            key for key, (_, created_at, ttl_seconds) in self._memory_cache.items()
            if now - created_at > ttl_seconds
        ]
        for key in expired_keys:
            del self._memory_cache[key]

        if self.session_only:
            return

        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        cursor.execute("""
            DELETE FROM api_cache
            WHERE created_at + ttl_seconds < ?
        """, (now,))
        
        deleted = cursor.rowcount
        conn.commit()
        conn.close()
        
        if deleted > 0:
            logger.info(f"Cleared {deleted} expired cache entries")


# Global cache instance
_global_cache: Optional[Cache] = None


def get_cache(db_path: Optional[Path] = None) -> Cache:
    """Get or create the global cache instance."""
    global _global_cache
    if _global_cache is None:
        _global_cache = Cache(db_path, session_only=Config.CACHE_SESSION_ONLY)
    return _global_cache


def reset_cache() -> None:
    """Reset the global cache (for testing)."""
    global _global_cache
    _global_cache = None
