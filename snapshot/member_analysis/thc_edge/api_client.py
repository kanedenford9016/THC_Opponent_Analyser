"""API client with rate limiting, retries, and caching."""

import aiohttp
import asyncio
from typing import Optional, Dict, Any
from thc_edge.config import Config
from thc_edge.logging_setup import setup_logging
from thc_edge.rate_limit import get_global_rate_limiter
from thc_edge.storage import get_cache


logger = setup_logging(__name__)


class APIClient:
    """
    Async HTTP client with built-in rate limiting, retries, and caching.
    """
    _inflight_requests: Dict[str, "asyncio.Future"] = {}
    
    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None):
        """
        Initialize API client.
        
        Args:
            base_url: Base URL for API (from config if not provided)
            api_key: API key for authentication (from config if not provided)
        """
        self.base_url = base_url or Config.BASE_URL
        self.api_key = api_key or Config.API_KEY
        self.rate_limiter = get_global_rate_limiter(
            Config.RATE_LIMIT_CALLS,
            Config.RATE_LIMIT_PERIOD
        )
        self.cache = get_cache()
        
        # Validate configuration
        if not self.base_url or self.base_url == "https://api.example.com/v2":
            raise ValueError(
                "BASE_URL not configured. Please set BASE_URL in .env file or "
                "environment variables."
            )
        
        logger.info(f"APIClient initialized with base_url: {self.base_url}")
    
    def _request_key(self, method: str, endpoint: str, params: Optional[Dict]) -> str:
        """Build a stable request key for in-flight de-duplication."""
        if params:
            params_key = "&".join(f"{k}={params[k]}" for k in sorted(params))
        else:
            params_key = ""
        return f"{method}:{endpoint}:{params_key}"

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict] = None,
        retries: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Make HTTP request with in-flight de-duplication.
        """
        request_key = self._request_key(method, endpoint, params)
        inflight = APIClient._inflight_requests.get(request_key)
        if inflight is not None:
            logger.debug(f"Awaiting in-flight request for {method} {endpoint}")
            return await inflight

        task = asyncio.create_task(self._make_request_internal(method, endpoint, params, retries))
        APIClient._inflight_requests[request_key] = task
        try:
            return await task
        finally:
            APIClient._inflight_requests.pop(request_key, None)

    async def _make_request_internal(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict] = None,
        retries: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Make HTTP request with rate limiting and retries.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            params: Query parameters
            retries: Number of retries (uses config default if not specified)
        
        Returns:
            Response data as dictionary
        
        Raises:
            RuntimeError: If all retries exhausted or fatal error
        """
        retries = retries or Config.HTTP_RETRIES
        url = self.base_url + endpoint
        headers = {}
        
        # Add API key as Authorization header (Torn API V2 format)
        if self.api_key:
            headers["Authorization"] = f"ApiKey {self.api_key}"
        
        attempt = 0
        backoff_factor = Config.HTTP_BACKOFF_FACTOR
        
        while attempt <= retries:
            try:
                # ENFORCE RATE LIMIT before making request
                logger.debug(f"Acquiring rate limit token for {method} {endpoint}")
                await self.rate_limiter.wait_until_available(1)
                
                # Make request
                logger.info(f"{method} {url} (attempt {attempt + 1}/{retries + 1})")
                
                async with aiohttp.ClientSession() as session:
                    async with session.request(
                        method,
                        url,
                        params=params,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=Config.HTTP_TIMEOUT)
                    ) as resp:
                        # Handle rate limiting (429)
                        if resp.status == 429:
                            retry_after = int(resp.headers.get("Retry-After", 60))
                            logger.warning(
                                f"Rate limited (429). Waiting {retry_after}s before retry"
                            )
                            await asyncio.sleep(retry_after)
                            attempt += 1
                            continue
                        
                        # Handle other HTTP errors
                        if resp.status >= 500:
                            # Server error - retry
                            logger.warning(
                                f"Server error {resp.status}. Will retry in "
                                f"{backoff_factor ** attempt}s"
                            )
                            if attempt < retries:
                                await asyncio.sleep(backoff_factor ** attempt)
                                attempt += 1
                                continue
                        
                        resp.raise_for_status()
                        
                        # Success
                        data = await resp.json()
                        logger.debug(f"Response: {resp.status}")
                        return data
                        
            except aiohttp.ClientError as e:
                logger.warning(f"Client error: {e}")
                if attempt < retries:
                    wait_time = backoff_factor ** attempt
                    logger.info(f"Retrying in {wait_time:.1f}s...")
                    await asyncio.sleep(wait_time)
                    attempt += 1
                    continue
                raise RuntimeError(f"Failed after {retries + 1} attempts: {e}")
            
            except Exception as e:
                logger.error(f"Unexpected error: {e}")
                raise
        
        raise RuntimeError(f"Max retries ({retries}) exceeded for {endpoint}")

    async def _make_full_url_request(
        self,
        method: str,
        url: str,
        params: Optional[Dict] = None,
        headers: Optional[Dict[str, str]] = None,
        retries: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Make HTTP request to a fully-qualified URL (no base_url prefix).
        """
        retries = retries or Config.HTTP_RETRIES
        headers = headers or {}

        attempt = 0
        backoff_factor = Config.HTTP_BACKOFF_FACTOR

        while attempt <= retries:
            try:
                # ENFORCE RATE LIMIT before making request
                logger.debug(f"Acquiring rate limit token for {method} {url}")
                await self.rate_limiter.wait_until_available(1)

                logger.info(f"{method} {url} (attempt {attempt + 1}/{retries + 1})")

                async with aiohttp.ClientSession() as session:
                    async with session.request(
                        method,
                        url,
                        params=params,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=Config.HTTP_TIMEOUT)
                    ) as resp:
                        if resp.status == 429:
                            retry_after = int(resp.headers.get("Retry-After", 60))
                            logger.warning(
                                f"Rate limited (429). Waiting {retry_after}s before retry"
                            )
                            await asyncio.sleep(retry_after)
                            attempt += 1
                            continue

                        if resp.status >= 500:
                            logger.warning(
                                f"Server error {resp.status}. Will retry in "
                                f"{backoff_factor ** attempt}s"
                            )
                            if attempt < retries:
                                await asyncio.sleep(backoff_factor ** attempt)
                                attempt += 1
                                continue

                        resp.raise_for_status()

                        data = await resp.json()
                        logger.debug(f"Response: {resp.status}")
                        return data

            except aiohttp.ClientError as e:
                logger.warning(f"Client error: {e}")
                if attempt < retries:
                    wait_time = backoff_factor ** attempt
                    logger.info(f"Retrying in {wait_time:.1f}s...")
                    await asyncio.sleep(wait_time)
                    attempt += 1
                    continue
                raise RuntimeError(f"Failed after {retries + 1} attempts: {e}")

            except Exception as e:
                logger.error(f"Unexpected error: {e}")
                raise

        raise RuntimeError(f"Max retries ({retries}) exceeded for {url}")
    
    async def fetch_player_stats(self, player_id: str) -> Dict[str, Any]:
        """
        Fetch player stats from API.
        
        Args:
            player_id: Player identifier
        
        Returns:
            Player stats dictionary
        """
        endpoint = Config.ENDPOINTS["player_stats"].format(player_id=player_id)
        cache_key = f"stats_{player_id}"
        
        # Check cache first
        cached = self.cache.get_cached_response(player_id, "player_stats")
        if cached:
            return cached
        
        # Fetch from API
        response = await self._make_request("GET", endpoint)
        
        # Cache response
        self.cache.cache_response(player_id, "player_stats", response)
        
        return response
    
    async def fetch_user_stats(self) -> Dict[str, Any]:
        """
        Fetch authenticated user's stats from API (no player_id required).
        
        Returns:
            User stats dictionary
        """
        endpoint = Config.ENDPOINTS["user_stats"]
        
        # Check cache first
        cached = self.cache.get_cached_response("self", "user_stats")
        if cached:
            return cached
        
        # Fetch from API
        response = await self._make_request("GET", endpoint)
        
        # Cache response
        self.cache.cache_response("self", "user_stats", response)
        
        return response
    
    async def fetch_player_history(self, player_id: str) -> Dict[str, Any]:
        """
        Fetch player history from API.
        
        Args:
            player_id: Player identifier
        
        Returns:
            Player history dictionary
        """
        endpoint = Config.ENDPOINTS["player_history"].format(player_id=player_id)
        
        # Check cache
        cached = self.cache.get_cached_response(player_id, "player_history")
        if cached:
            return cached
        
        # Fetch from API
        response = await self._make_request("GET", endpoint)
        
        # Cache response
        self.cache.cache_response(player_id, "player_history", response)
        
        return response
    
    async def fetch_leaderboard(self) -> Dict[str, Any]:
        """
        Fetch leaderboard data.
        
        Returns:
            Leaderboard data
        """
        endpoint = Config.ENDPOINTS["leaderboard"]
        
        # Check cache
        cached = self.cache.get_cached_response("global", "leaderboard")
        if cached:
            return cached
        
        # Fetch from API
        response = await self._make_request("GET", endpoint)
        
        # Cache response
        self.cache.cache_response("global", "leaderboard", response)
        
        return response
    
    async def fetch_multiple_players(self, player_ids: list) -> Dict[str, Dict]:
        """
        Fetch stats for multiple players concurrently.
        
        Args:
            player_ids: List of player identifiers
        
        Returns:
            Dictionary mapping player_id to stats
        """
        results = {}
        tasks = [
            self._fetch_with_error_handling(player_id)
            for player_id in player_ids
        ]
        
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        
        for player_id, response in zip(player_ids, responses):
            if isinstance(response, Exception):
                logger.error(f"Failed to fetch player {player_id}: {response}")
            else:
                results[player_id] = response
        
        return results
    
    async def _fetch_with_error_handling(self, player_id: str) -> Dict:
        """Helper to fetch with error handling."""
        try:
            return await self.fetch_player_stats(player_id)
        except Exception as e:
            logger.error(f"Error fetching player {player_id}: {e}")
            raise
    
    async def fetch_faction_members(self, faction_id: str) -> Dict[str, Any]:
        """
        Fetch all members of a faction.
        
        Args:
            faction_id: Faction identifier
        
        Returns:
            Dictionary of faction members with their IDs
        """
        endpoint = Config.ENDPOINTS["faction_members"].format(faction_id=faction_id)
        
        # Check cache first
        cached = self.cache.get_cached_response(faction_id, "faction_members")
        if cached:
            return cached
        
        # Fetch from API
        response = await self._make_request("GET", endpoint)
        
        # Cache response (faction data changes less frequently, use 24 hour TTL)
        self.cache.cache_response(faction_id, "faction_members", response, ttl_seconds=86400)
        
        return response
    
    async def fetch_faction_opponents(self, faction_id: str) -> list:
        """
        Get list of opponent player IDs from a faction.
        
        Args:
            faction_id: Faction identifier
        
        Returns:
            List of player IDs in the faction
        """
        faction_data = await self.fetch_faction_members(faction_id)
        
        # Check for API errors in response
        if isinstance(faction_data, dict) and "error" in faction_data:
            error_code = faction_data.get("error", {}).get("code")
            error_msg = faction_data.get("error", {}).get("error", "Unknown error")
            
            if error_code == 2:
                logger.error(f"API Error: Invalid API key. Please check your API_KEY in .env file")
            elif error_code == 7:
                logger.error(f"API Error: Insufficient API key permissions. Your API key needs 'faction.members' permission")
            else:
                logger.error(f"API Error fetching faction members: {error_msg}")
            return []
        
        # Extract player IDs from faction members response
        # Torn API V2 returns: {"members": [{"id": 123, ...}, {"id": 456, ...}, ...]}
        if isinstance(faction_data, dict) and "members" in faction_data:
            members = faction_data["members"]
            if isinstance(members, list):
                player_ids = [str(member.get("id")) for member in members if isinstance(member, dict) and "id" in member]
                logger.info(f"Found {len(player_ids)} opponents in faction {faction_id}")
                return player_ids
        
        logger.warning(f"Could not parse faction members from response - unexpected format")
        logger.debug(f"Faction response keys: {list(faction_data.keys()) if isinstance(faction_data, dict) else type(faction_data)}")
        return []
    
    async def fetch_faction_attacks(self, limit: int = 100) -> Dict[str, Any]:
        """
        Fetch recent faction attack logs.
        
        Args:
            limit: Maximum number of attacks to fetch (default: 100)
        
        Returns:
            Dictionary containing attack logs with attacker/defender/outcome data
        """
        endpoint = Config.ENDPOINTS["faction_attacks"].format(limit=limit)
        
        # Check cache first (short TTL since attack data changes frequently)
        cached = self.cache.get_cached_response("faction", "attacks")
        if cached:
            return cached
        
        # Fetch from API
        response = await self._make_request("GET", endpoint)
        
        # Cache response with 5 minute TTL
        self.cache.cache_response("faction", "attacks", response, ttl_seconds=300)
        
        return response
    
    async def fetch_faction_reports(self, limit: int = 20, offset: int = 0) -> Dict[str, Any]:
        """
        Fetch faction battle reports with detailed statistics.
        
        Args:
            limit: Maximum number of reports to fetch (default: 20)
            offset: Starting offset for pagination (default: 0)
        
        Returns:
            Dictionary containing battle reports with detailed stats
        """
        endpoint = Config.ENDPOINTS["faction_reports"].format(limit=limit, offset=offset)
        
        # Check cache first (short TTL)
        cache_key = f"reports_{limit}_{offset}"
        cached = self.cache.get_cached_response("faction", cache_key)
        if cached:
            return cached
        
        # Fetch from API
        response = await self._make_request("GET", endpoint)
        
        # Cache response with 5 minute TTL
        self.cache.cache_response("faction", cache_key, response, ttl_seconds=300)
        
        return response

    async def fetch_faction_reports_v1(
        self,
        faction_id: str,
        from_timestamp: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Fetch faction reports using the v1 endpoint with a dedicated API key.

        Args:
            faction_id: Faction identifier
            from_timestamp: Oldest timestamp marker for pagination

        Returns:
            Dictionary containing faction reports
        """
        if not Config.FACTION_REPORT_API:
            raise ValueError("FACTION_REPORT_API not configured in .env")

        base_url = Config.FACTION_REPORT_BASE_URL.rstrip("/")
        url = f"{base_url}/faction/{faction_id}"

        params: Dict[str, Any] = {
            "selections": "reports",
            "key": Config.FACTION_REPORT_API
        }
        if from_timestamp:
            params["from"] = str(int(from_timestamp))

        cache_key = f"faction_reports_v1_{faction_id}_{from_timestamp or 'latest'}"
        cached = self.cache.get_cached_response("faction", cache_key)
        if cached:
            return cached

        response = await self._make_full_url_request("GET", url, params=params)

        self.cache.cache_response("faction", cache_key, response, ttl_seconds=300)

        return response
    
    async def fetch_user_bars(self) -> Dict[str, Any]:
        """
        Fetch authenticated user's bars (life, energy, nerve, happy, chain).
        
        Returns:
            Bars dictionary with current and maximum values
        """
        endpoint = "/user/bars"
        
        # Short cache (30 seconds) since bars change frequently
        cached = self.cache.get_cached_response("self", "bars")
        if cached:
            return cached
        
        # Fetch from API
        response = await self._make_request("GET", endpoint)
        
        # Cache response with short TTL
        self.cache.cache_response("self", "bars", response, ttl_seconds=30)
        
        return response
