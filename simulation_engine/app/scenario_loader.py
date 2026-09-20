"""
Simulation Engine Scenario Loader
Loads and validates FLOOD_DEMO_01.json (or any scenario JSON file).
Returns a validated ScenarioDefinition — no database contact.
"""
import json
import os
from pathlib import Path
from typing import Optional

from app.models import ScenarioDefinition


def _find_scenario_path(scenario_id: str, scenario_dir: str = "./config") -> Optional[Path]:
    """Find scenario file in canonical config location."""
    candidate_paths = [
        Path(scenario_dir) / f"{scenario_id}.json",
        Path(__file__).parent.parent / "config" / f"{scenario_id}.json",
    ]
    for p in candidate_paths:
        if p.exists() and p.is_file():
            return p
    return None


def load_scenario(scenario_id: str, scenario_dir: str = "./config") -> ScenarioDefinition:
    """
    Load and validate a scenario definition from a JSON file.

    Parameters
    ----------
    scenario_id : str
        Scenario file stem, e.g. "FLOOD_DEMO_01", "EARTHQUAKE_DEMO_01", "LANDSLIDE_DEMO_01"
    scenario_dir : str
        Directory containing scenario JSON files (default: ./config)

    Returns
    -------
    ScenarioDefinition
        Validated scenario object
    """
    scenario_path = _find_scenario_path(scenario_id, scenario_dir)
    if not scenario_path:
        search_dirs = [scenario_dir, str(Path(__file__).parent.parent / "config")]
        raise FileNotFoundError(
            f"Scenario file not found: '{scenario_id}.json'. Searched: {search_dirs}"
        )

    with open(scenario_path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    try:
        scenario = ScenarioDefinition.model_validate(raw)
    except Exception as e:
        raise ValueError(f"Scenario '{scenario_id}' failed validation: {e}") from e

    # Validate event ordering (must be strictly non-decreasing offset_seconds)
    last_offset = -1
    for i, evt in enumerate(scenario.events):
        offset = evt.get("offset_seconds", -1)
        if not isinstance(offset, int) or offset < 0:
            raise ValueError(f"Event {i} has invalid offset_seconds: {offset!r}")
        if offset < last_offset:
            raise ValueError(
                f"Event {i} (offset={offset}) is out of order "
                f"(previous offset={last_offset}). Events must be non-decreasing."
            )
        last_offset = offset

    # Validate all event_ids are unique
    seen_ids = set()
    for evt in scenario.events:
        eid = evt.get("event_id")
        if not eid:
            raise ValueError("Every event must have a non-empty event_id")
        if eid in seen_ids:
            raise ValueError(f"Duplicate event_id detected: {eid!r}")
        seen_ids.add(eid)

    return scenario


def list_available_scenarios(scenario_dir: str = "./config") -> list:
    """Return sorted list of available scenario IDs from canonical config location."""
    scenarios = set()
    candidate_dirs = [
        Path(scenario_dir),
        Path(__file__).parent.parent / "config",
    ]
    for d in candidate_dirs:
        if d.exists() and d.is_dir():
            for f in d.glob("*.json"):
                if f.stem in ("FLOOD_DEMO_01", "EARTHQUAKE_DEMO_01", "LANDSLIDE_DEMO_01") or f.stem.endswith("_DEMO_01"):
                    scenarios.add(f.stem)
    return sorted(list(scenarios))

