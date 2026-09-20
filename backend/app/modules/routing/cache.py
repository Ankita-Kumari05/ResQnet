"""
ResQnet Routing Cache Boundary (Step 6.9)
Lightweight in-memory graph cache and invalidation boundary.
When ground-truth road status or hazards mutate, this hook is invoked to set
the dirty flag so the routing graph is lazily rebuilt from the DB.
"""
import logging
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("resqnet.routing.cache")

# Global in-memory cache structures
_GRAPH_CACHE: Optional[Tuple[Any, Dict[int, Any], Dict[int, Any]]] = None
_IS_DIRTY: bool = True


def is_cache_dirty() -> bool:
    """Returns True if the routing graph cache needs to be rebuilt."""
    global _IS_DIRTY, _GRAPH_CACHE
    return _IS_DIRTY or _GRAPH_CACHE is None


def get_cached_graph() -> Optional[Tuple[Any, Dict[int, Any], Dict[int, Any]]]:
    """Returns the cached graph tuple (G, intersection_map, road_map) if clean."""
    global _IS_DIRTY, _GRAPH_CACHE
    if not _IS_DIRTY:
        return _GRAPH_CACHE
    return None


def set_cached_graph(G: Any, intersection_map: Dict[int, Any], road_map: Dict[int, Any]) -> None:
    """Stores the newly built graph tuple in memory and marks cache clean."""
    global _GRAPH_CACHE, _IS_DIRTY
    _GRAPH_CACHE = (G, intersection_map, road_map)
    _IS_DIRTY = False
    logger.info("Routing graph cache updated and marked clean.")


def invalidate_route_cache(road_id: Optional[int] = None) -> None:
    """
    Invalidates routing cache entries when road ground-truth or hazard perimeters mutate.
    - If road_id is provided, marks graph cache as dirty.
    - If road_id is None, marks graph cache as dirty.
    """
    global _IS_DIRTY
    _IS_DIRTY = True
    if road_id is not None:
        logger.info(f"Route cache invalidated for road segment ID: {road_id}")
    else:
        logger.info("Entire route cache invalidated due to ground-truth / hazard update.")
