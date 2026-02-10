"""Token bucket rate limiter for API calls."""

import asyncio
import time
from typing import Optional
from thc_edge.logging_setup import setup_logging


logger = setup_logging(__name__)


class TokenBucket:
    """
    Thread-safe and async-safe token bucket rate limiter.
    Implements a leaky bucket algorithm to enforce strict rate limits.
    """
    
    def __init__(self, capacity: int, refill_rate: float):
        """
        Initialize the token bucket.
        
        Args:
            capacity: Maximum number of tokens (requests per period)
            refill_rate: Tokens per second to refill
        """
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens = float(capacity)
        self.last_refill = time.time()
        self._lock = asyncio.Lock()
        logger.info(f"TokenBucket initialized: capacity={capacity}, refill_rate={refill_rate}/s")
    
    async def acquire(self, tokens: int = 1, timeout: Optional[float] = None) -> bool:
        """
        Acquire tokens from the bucket.
        
        Args:
            tokens: Number of tokens to acquire
            timeout: Maximum time to wait for tokens (None = wait indefinitely)
        
        Returns:
            True if tokens were acquired, False if timeout exceeded
        """
        start_time = time.time()
        
        while True:
            async with self._lock:
                # Refill tokens based on elapsed time
                now = time.time()
                elapsed = now - self.last_refill
                refilled = elapsed * self.refill_rate
                self.tokens = min(self.capacity, self.tokens + refilled)
                self.last_refill = now
                
                # Try to acquire tokens
                if self.tokens >= tokens:
                    self.tokens -= tokens
                    logger.debug(f"Acquired {tokens} tokens. Remaining: {self.tokens:.2f}")
                    return True
            
            # Check timeout
            if timeout is not None:
                elapsed_total = time.time() - start_time
                if elapsed_total > timeout:
                    logger.warning(f"Token acquisition timeout after {elapsed_total:.2f}s")
                    return False
            
            # Wait a bit before retrying
            await asyncio.sleep(0.1)
    
    async def wait_until_available(self, tokens: int = 1) -> None:
        """
        Wait until the specified number of tokens are available.
        
        Args:
            tokens: Number of tokens to wait for
        """
        await self.acquire(tokens, timeout=None)
    
    async def get_state(self) -> dict:
        """Get current bucket state (for monitoring)."""
        async with self._lock:
            now = time.time()
            elapsed = now - self.last_refill
            refilled = elapsed * self.refill_rate
            tokens = min(self.capacity, self.tokens + refilled)
            return {
                "tokens": tokens,
                "capacity": self.capacity,
                "refill_rate": self.refill_rate
            }


# Global rate limiter instance
_global_bucket: Optional[TokenBucket] = None


def get_global_rate_limiter(capacity: int = 80, period: int = 60) -> TokenBucket:
    """
    Get or create the global rate limiter.
    
    Args:
        capacity: Tokens per period (default 80)
        period: Period in seconds (default 60)
    
    Returns:
        Global TokenBucket instance
    """
    global _global_bucket
    if _global_bucket is None:
        refill_rate = capacity / period  # tokens per second
        _global_bucket = TokenBucket(capacity, refill_rate)
    return _global_bucket


def reset_global_rate_limiter() -> None:
    """Reset the global rate limiter (for testing)."""
    global _global_bucket
    _global_bucket = None
