from __future__ import annotations
import os
from pathlib import Path
from flask import Blueprint, jsonify, request
import copy

from geometry import load, validate
from api.handlers import (
    get_ground_sites,
    get_satellites,
    get_routes,
    get_snapshot,
    calculate,
    export_result,
    load_scenario,
    save_variant,
    list_variants,
    delete_variant,
    compare_variants,
    apply_overrides,
)

api_bp = Blueprint("api", __name__, url_prefix="/api")

_state = {
    "scenario": None,
    "scenario_id": None,
}

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SCENARIO_PATH = os.environ.get(
    "SCENARIO_PATH",
    str(BASE_DIR / "scenar" / "01_full_constellation.json"),
)


def _guess_field(msg: str) -> str | None:
    """
    Пытается извлечь имя проблемного поля из текста ошибки.
    Используется для ответа фронту: {"error": "...", "field": "altitude_km"}.
    """
    if not msg:
        return None

    # Сообщения apply_overrides начинаются с имени поля:
    #   "altitude_km must be 200..1200, got -100"
    first = msg.split(maxsplit=1)[0]
    known_direct = {
        "altitude_km",
        "inclination_deg",
        "min_elevation_deg",
        "isl_range_km",
        "target_availability",
        "launch_stage",
        "raan_deg",
        "phase_deg",
        "horizon_s",
        "step_s",
    }
    if first in known_direct:
        return first

    # Сообщения validate() — сопоставляем по ключевым фразам
    mapping = [
        ("Invalid orbit",                   "altitude_km / inclination_deg"),
        ("Non-finite environment value",    "environment"),
        ("Invalid time grid",               "horizon_s / step_s"),
        ("Invalid link/target values",      "min_elevation_deg / isl_range_km"),
        ("Duplicate/empty planes",          "design.planes"),
        ("Invalid plane angle",             "planes[].raan_deg / phase_deg"),
        ("Duplicate/empty satellite IDs",   "design.satellites[].id"),
        ("Invalid satellite",               "design.satellites[]"),
        ("Non-unique node IDs",             "ground_sites / satellites"),
        ("Client and gateway required",     "ground_sites"),
        ("Invalid ground site",             "ground_sites[]"),
        ("Invalid outage",                  "failures / gateway_outages"),
        ("Unknown plane",                   "plane_id"),
        ("Unknown satellite",               "satellite_id"),
        ("Unknown gateway",                 "gateway_id"),
        ("Invalid failure interval",        "failures[].start_s / end_s"),
        ("Invalid gateway outage interval", "gateway_outages[].start_s / end_s"),
        ("must be 200..1200",               "altitude_km"),
        ("must be 0..180",                  "inclination_deg"),
        ("must be 0..90",                   "min_elevation_deg"),
        ("must be 0..10000",                "isl_range_km"),
        ("must be 0..1",                    "target_availability"),
        ("must be 1, 2 or 3",               "launch_stage"),
        ("must be 0..360",                  "raan_deg / phase_deg"),
    ]
    for needle, field in mapping:
        if needle in msg:
            return field

    return None


def ensure_scenario():
    if _state["scenario"] is None:
        _state["scenario"] = load(DEFAULT_SCENARIO_PATH)
        _state["scenario_id"] = _state["scenario"].get("meta", {}).get("id", "unknown")
    return _state["scenario"]


# ============================================================
# HEALTH
# ============================================================

@api_bp.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "scenario_loaded": _state["scenario"] is not None,
    })


# ============================================================
# СЦЕНАРИЙ
# ============================================================

@api_bp.route("/scenario/load", methods=["POST"])
def route_load_scenario():
    data = request.get_json(silent=True) or {}
    path = data.get("path")

    try:
        if path:
            scenario = load(path)
        else:
            if not data:
                return jsonify({"error": "No scenario data", "field": None}), 400

            if data.get("schema_version") == "cosmo-A-result-1.0":
                scenario = data["effective_scenario"]
            else:
                scenario = data

            validate(scenario)

    except ValueError as e:
        return jsonify({
            "error": str(e),
            "field": _guess_field(str(e)),
        }), 400
    except Exception as e:
        return jsonify({"error": str(e), "field": None}), 400

    _state["scenario"] = scenario
    _state["scenario_id"] = scenario.get("meta", {}).get("id", "unknown")

    return jsonify({
        "status": "ok",
        "scenario_id": _state["scenario_id"],
        "scenario": load_scenario(scenario),
    })


@api_bp.route("/scenario/export", methods=["POST"])
def route_export_scenario():
    scenario = ensure_scenario()
    data = request.get_json(silent=True) or {}
    overrides = data.get("overrides")

    try:
        if overrides:
            effective = apply_overrides(scenario, overrides)
        else:
            effective = copy.deepcopy(scenario)
    except ValueError as e:
        return jsonify({
            "error": str(e),
            "field": _guess_field(str(e)),
        }), 400
    except Exception as e:
        return jsonify({"error": str(e), "field": None}), 400

    return jsonify(effective)


# ============================================================
# НАЗЕМНЫЕ ПУНКТЫ
# ============================================================

@api_bp.route("/ground_sites", methods=["GET"])
def route_ground_sites():
    scenario = ensure_scenario()
    return jsonify(get_ground_sites(scenario))


# ============================================================
# СПУТНИКИ
# ============================================================

@api_bp.route("/satellites", methods=["GET"])
def route_satellites():
    scenario = ensure_scenario()
    t_s = float(request.args.get("t_s", 0))
    return jsonify(get_satellites(scenario, t_s))


# ============================================================
# МАРШРУТЫ
# ============================================================

@api_bp.route("/routes", methods=["GET", "POST"])
def route_routes():
    scenario = ensure_scenario()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        t_s = float(data.get("t_s", 0))
        overrides = data.get("overrides")
    else:
        t_s = float(request.args.get("t_s", 0))
        overrides = None

    try:
        result = get_routes(scenario, t_s, overrides)
    except ValueError as e:
        return jsonify({
            "error": str(e),
            "field": _guess_field(str(e)),
        }), 400
    except Exception as e:
        return jsonify({"error": str(e), "field": None}), 400

    return jsonify(result)


# ============================================================
# SNAPSHOT
# ============================================================

@api_bp.route("/snapshot", methods=["GET", "POST"])
def route_snapshot():
    scenario = ensure_scenario()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        t_s = float(data.get("t_s", 0))
        overrides = data.get("overrides")
    else:
        t_s = float(request.args.get("t_s", 0))
        overrides = None

    try:
        result = get_snapshot(scenario, t_s, overrides)
    except ValueError as e:
        return jsonify({
            "error": str(e),
            "field": _guess_field(str(e)),
        }), 400
    except Exception as e:
        return jsonify({"error": str(e), "field": None}), 400

    return jsonify(result)


# ============================================================
# РАСЧЁТ
# ============================================================

@api_bp.route("/calculate", methods=["POST"])
def route_calculate():
    scenario = ensure_scenario()
    data = request.get_json(silent=True) or {}
    overrides = data.get("overrides")

    try:
        result = calculate(scenario, overrides)
    except ValueError as e:
        return jsonify({
            "error": str(e),
            "field": _guess_field(str(e)),
        }), 400
    except Exception as e:
        return jsonify({"error": str(e), "field": None}), 400

    return jsonify(result)


@api_bp.route("/export", methods=["POST"])
def route_export():
    scenario = ensure_scenario()
    data = request.get_json(silent=True) or {}
    overrides = data.get("overrides")

    try:
        result = export_result(scenario, overrides)
    except ValueError as e:
        return jsonify({
            "error": str(e),
            "field": _guess_field(str(e)),
        }), 400
    except Exception as e:
        return jsonify({"error": str(e), "field": None}), 400

    return jsonify(result)


# ============================================================
# ВАРИАНТЫ
# ============================================================

@api_bp.route("/variants/save", methods=["POST"])
def route_save_variant():
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    overrides = data.get("overrides", {})
    description = data.get("description", "")

    if not name:
        return jsonify({"error": "name is required", "field": "name"}), 400

    try:
        result = save_variant(name, overrides, description)
    except Exception as e:
        return jsonify({"error": str(e), "field": None}), 400

    return jsonify(result)


@api_bp.route("/variants", methods=["GET"])
def route_list_variants():
    return jsonify({"variants": list_variants()})


@api_bp.route("/variants/<name>", methods=["DELETE"])
def route_delete_variant(name: str):
    try:
        result = delete_variant(name)
    except Exception as e:
        return jsonify({"error": str(e)}), 404
    return jsonify(result)


@api_bp.route("/variants/compare", methods=["POST"])
def route_compare_variants():
    scenario = ensure_scenario()
    data = request.get_json(silent=True) or {}
    name_a = data.get("variant_a")
    name_b = data.get("variant_b")

    if not name_a or not name_b:
        return jsonify({
            "error": "variant_a and variant_b are required",
            "field": "variant_a / variant_b",
        }), 400

    try:
        result = compare_variants(scenario, name_a, name_b)
    except Exception as e:
        return jsonify({"error": str(e), "field": None}), 400

    return jsonify(result)