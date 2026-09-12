"""
Flask роуты — принимают HTTP-запросы и вызывают модули реакции.
"""
from __future__ import annotations
import os
from flask import Blueprint, jsonify, request

from geometry import load, validate
from api.handlers import (
    get_ground_sites,
    get_satellites,
    get_routes,
    get_snapshot,
    calculate,
    export_result,
    load_scenario,
)


api_bp = Blueprint("api", __name__, url_prefix="/api")

# Глобальное хранилище сценария (для демо — in-memory)
_state = {
    "scenario": None,
    "scenario_id": None,
}

# Дефолтный сценарий (можно поменять через переменную окружения SCENARIO_PATH)
DEFAULT_SCENARIO_PATH = os.environ.get(
    "SCENARIO_PATH",
    "/home/chelovek/Desktop/work/Данные/01_full_constellation.json",
)


def ensure_scenario():
    """Загружает дефолтный сценарий, если ещё не загружен."""
    if _state["scenario"] is None:
        _state["scenario"] = load(DEFAULT_SCENARIO_PATH)
        _state["scenario_id"] = _state["scenario"].get("meta", {}).get("id", "unknown")
    return _state["scenario"]


# ---------- Healthcheck ----------

@api_bp.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "scenario_loaded": _state["scenario"] is not None})


# ---------- Загрузка сценария ----------

@api_bp.route("/scenario/load", methods=["POST"])
def route_load_scenario():
    """
    Загрузить сценарий.
    Вариант 1: {"path": "/путь/к/файлу.json"}
    Вариант 2: сам JSON в теле запроса
    """
    data = request.get_json(silent=True) or {}
    path = data.get("path")
    
    try:
        if path:
            scenario = load(path)
        else:
            if not data:
                return jsonify({"error": "No scenario data"}), 400
            validate(data)
            scenario = data
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    
    _state["scenario"] = scenario
    _state["scenario_id"] = scenario.get("meta", {}).get("id", "unknown")
    
    return jsonify({
        "status": "ok",
        "scenario_id": _state["scenario_id"],
        "scenario": load_scenario(scenario),
    })


# ---------- Наземные пункты ----------

@api_bp.route("/ground_sites", methods=["GET"])
def route_ground_sites():
    scenario = ensure_scenario()
    return jsonify(get_ground_sites(scenario))


# ---------- Спутники в момент t_s ----------

@api_bp.route("/satellites", methods=["GET"])
def route_satellites():
    scenario = ensure_scenario()
    t_s = float(request.args.get("t_s", 0))
    return jsonify(get_satellites(scenario, t_s))


# ---------- Маршруты в момент t_s ----------

@api_bp.route("/routes", methods=["GET"])
def route_routes():
    scenario = ensure_scenario()
    t_s = float(request.args.get("t_s", 0))
    return jsonify(get_routes(scenario, t_s))


# ---------- Полный snapshot (спутники + связи + маршруты) ----------

@api_bp.route("/snapshot", methods=["GET"])
def route_snapshot():
    scenario = ensure_scenario()
    t_s = float(request.args.get("t_s", 0))
    return jsonify(get_snapshot(scenario, t_s))


# ---------- Полный расчёт с overrides ----------

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