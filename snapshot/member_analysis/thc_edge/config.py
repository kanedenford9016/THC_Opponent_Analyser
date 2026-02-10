"""Configuration module for THC Edge."""

import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv


class Config:
    """Configuration handler with .env and environment variable support."""
    
    # Load .env file
    env_path = Path(__file__).parent.parent / ".env"
    load_dotenv(env_path)
    
    # API Configuration
    API_KEY: str = os.getenv("API_KEY", "")
    BASE_URL: str = os.getenv("BASE_URL", "https://api.example.com/v2")
    FACTION_REPORT_API: str = os.getenv("FACTION_REPORT_API", "")
    FACTION_REPORT_BASE_URL: str = os.getenv("FACTION_REPORT_BASE_URL", "https://api.torn.com")
    
    # Item Details API Configuration (separate key for item data)
    ITEM_API_KEY: str = os.getenv("ITEM_API_KEY", "")
    ITEM_BASE_URL: str = os.getenv("ITEM_BASE_URL", "https://api.example.com/v2")
    
    # Rate Limiting (80 calls per minute)
    RATE_LIMIT_CALLS = 80
    RATE_LIMIT_PERIOD = 60  # seconds
    
    # Cache Configuration
    CACHE_DB_PATH = Path(__file__).parent.parent / "cache.db"
    CACHE_TTL_SECONDS = 3600  # 1 hour default
    CACHE_SESSION_ONLY = True  # Always fetch fresh data each session
    
    # Data Paths
    DATA_DIR = Path(__file__).parent.parent / "data"
    OUTPUT_DIR = Path(__file__).parent.parent / "output"
    
    # Model Configuration
    MODEL_PATH = DATA_DIR / "trained_model.pkl"
    SCALER_PATH = DATA_DIR / "scaler.pkl"
    
    # HTTP Configuration
    HTTP_TIMEOUT = 30  # seconds
    HTTP_RETRIES = 3
    HTTP_BACKOFF_FACTOR = 1.5
    
    # Logging Configuration
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE = Path(__file__).parent.parent / "thc_edge.log"
    
    # Feature Configuration (Torn Game Stats)
    STATS_COLUMNS = ["Strength", "Speed", "Defence", "Dexterity"]
    STATS_MAPPING = {
        # Torn API uses lowercase names
        "strength": "Strength",
        "speed": "Speed",
        "defence": "Defence",
        "defense": "Defence",
        "dexterity": "Dexterity",
        "str": "Strength",
        "spd": "Speed",
        "def": "Defence",
        "dex": "Dexterity",
        # Torn-specific lowercase mappings
        "total_strength": "Strength",
        "total_speed": "Speed",
        "total_defence": "Defence",
        "total_dexterity": "Dexterity",
    }
    
    # API Endpoints (Torn API V2)
    ENDPOINTS = {
        "player_stats": "/user/{player_id}/personalstats,basic?cat=all&stat=",
        "user_stats": "/user/personalstats,basic?cat=all&stat=",  # Authenticated user (no ID)
        "player_history": "/user/{player_id}/history",
        "faction_members": "/faction/{faction_id}/members?striptags=true",
        "faction_attacks": "/faction/attacks?limit={limit}&sort=DESC",
        "faction_reports": "/faction/reports?cat=stats&limit={limit}&offset={offset}&sort=DESC",
        "leaderboard": "/leaderboard",
    }
    
    # Item Details Endpoints (separate for item data)
    ITEM_ENDPOINTS = {
        "item_detail": "/item/{item_id}?cat=all&stat=",
        "item_market": "/market/{item_id}?cat=all&stat=",
        "item_mods": "/torn/itemmods",
        "items": "/torn/items?cat=All&sort=ASC",
    }
    
    @classmethod
    def create_directories(cls) -> None:
        """Create necessary directories if they don't exist."""
        cls.DATA_DIR.mkdir(exist_ok=True, parents=True)
        cls.OUTPUT_DIR.mkdir(exist_ok=True, parents=True)
    
    @classmethod
    def validate(cls) -> bool:
        """Validate required configuration."""
        if not cls.BASE_URL or cls.BASE_URL == "https://api.example.com/v2":
            raise ValueError("BASE_URL not set. Please set it in .env or environment variables.")
        return True


# Initialize directories on import
Config.create_directories()
