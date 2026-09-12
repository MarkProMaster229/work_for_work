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


def ensure_scenario():
    if _state["scenario"] is None:
        _state["scenario"] = load(DEFAULT_SCENARIO_PATH)
        _state["scenario_id"] = _state["scenario"].get("meta", {}).get("id", "unknown")
    return _state["scenario"]


@api_bp.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "scenario_loaded": _state["scenario"] is not None})


@api_bp.route("/scenario/load", methods=["POST"])
def route_load_scenario():
    data = request.get_json(silent=True) or {}
    path = data.get("path")

    try:
        if path:
            scenario = load(path)
        else:
            if not data:
                return jsonify({"error": "No scenario data"}), 400

            if data.get("schema_version") == "cosmo-A-result-1.0":
                scenario = data["effective_scenario"]
            else:
                scenario = data

            validate(scenario)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    _state["scenario"] = scenario
    _state["scenario_id"] = scenario.get("meta", {}).get("id", "unknown")

    return jsonify({
        "status": "ok",
        "scenario_id": _state["scenario_id"],
        "scenario": load_scenario(scenario),
    })


@api_bp.route("/ground_sites", methods=["GET"])
def route_ground_sites():
    scenario = ensure_scenario()
    return jsonify(get_ground_sites(scenario))


@api_bp.route("/satellites", methods=["GET"])
def route_satellites():
    scenario = ensure_scenario()
    t_s = float(request.args.get("t_s", 0))
    return jsonify(get_satellites(scenario, t_s))


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
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(result)


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
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(result)


@api_bp.route("/calculate", methods=["POST"])
def route_calculate():
    scenario = ensure_scenario()
    data = request.get_json(silent=True) or {}
    overrides = data.get("overrides")
    try:
        result = calculate(scenario, overrides)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(result)


@api_bp.route("/export", methods=["POST"])
def route_export():
    scenario = ensure_scenario()
    data = request.get_json(silent=True) or {}
    overrides = data.get("overrides")
    try:
        result = export_result(scenario, overrides)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(result)


@api_bp.route("/variants/save", methods=["POST"])
def route_save_variant():
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    overrides = data.get("overrides", {})
    description = data.get("description", "")

    if not name:
        return jsonify({"error": "name is required"}), 400

    try:
        result = save_variant(name, overrides, description)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

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
        return jsonify({"error": "variant_a and variant_b are required"}), 400

    try:
        result = compare_variants(scenario, name_a, name_b)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(result)


@api_bp.route("/scenario/export", methods=["POST"])
def route_export_scenario():
    scenario = ensure_scenario()
    data = request.get_json(silent=True) or {}
    overrides = data.get("overrides")

    if overrides:
        effective = apply_overrides(scenario, overrides)
    else:
        effective = copy.deepcopy(scenario)

    return jsonify(effective)