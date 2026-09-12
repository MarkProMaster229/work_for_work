from __future__ import annotations
import copy
import sys
from pathlib import Path

from core.graph import build_graph
from core.simulation import bfs
from core.metrics import calc_metrics
from core.coords import to_latlon

from core.metrics import calc_metrics, calc_metrics_with_reasons, diagnose_no_route

# Импорт физики
from geometry import load, snapshot, validate


# ============================================================
# 1. НАЗЕМНЫЕ ПУНКТЫ (фиксированные координаты)
# ============================================================

def get_ground_sites(scenario: dict) -> dict:
    """
    Возвращает клиентов и шлюзы с их фиксированными координатами.
    Вызывается один раз при загрузке карты.
    """
    clients = []
    gateways = []
    
    for g in scenario["ground_sites"]:
        item = {
            "id": g["id"],
            "name": g.get("name", g["id"]),
            "lat": g["lat_deg"],
            "lon": g["lon_deg"],
            "role": g["role"],
        }
        if g["role"] == "client":
            clients.append(item)
        else:
            gateways.append(item)
    
    return {"clients": clients, "gateways": gateways}


# ============================================================
# 2. СПУТНИКИ В МОМЕНТ t_s
# ============================================================

def get_satellites(scenario: dict, t_s: float) -> dict:
    """
    Возвращает координаты спутников в момент t_s (в lat/lon).
    Вызывается при перемотке таймлайна.
    """
    snap = snapshot(scenario, t_s)
    
    satellites = []
    for sat in snap["satellites"]:
        lat, lon = to_latlon(sat["x_km"], sat["y_km"], sat["z_km"])
        satellites.append({
            "id": sat["id"],
            "lat": lat,
            "lon": lon,
            "active": sat["active"],
        })
    
    return {"t_s": t_s, "satellites": satellites}


# ============================================================
# 3. МАРШРУТЫ В МОМЕНТ t_s
# ============================================================

def get_routes(scenario: dict, t_s: float, overrides: dict | None = None) -> dict:
    """
    Возвращает маршруты от клиентов до шлюзов в момент t_s.
    Если передан overrides — применяет его.
    """
    if overrides:
        scenario = apply_overrides(scenario, overrides)
    
    snap = snapshot(scenario, t_s)
    graph = build_graph(snap["edges"])
    
    clients = [g["id"] for g in scenario["ground_sites"] if g["role"] == "client"]
    gateways = {g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway"}
    
    routes = {}
    for client in clients:
        routes[client] = bfs(client, gateways, graph)
    
    return {"t_s": t_s, "routes": routes}

# ============================================================
# 4. ПОЛНЫЙ SNAPSHOT (спутники + связи + маршруты)
# ============================================================
def get_snapshot(scenario: dict, t_s: float, overrides: dict | None = None) -> dict:
    """
    Полный snapshot для карты: спутники, связи, маршруты, serving_satellites.
    Если передан overrides — применяет его.
    """
    if overrides:
        scenario = apply_overrides(scenario, overrides)
    
    snap = snapshot(scenario, t_s)
    graph = build_graph(snap["edges"])
    
    clients = [g["id"] for g in scenario["ground_sites"] if g["role"] == "client"]
    gateways = {g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway"}
    gateways_set = set(gateways)
    
    # Спутники с lat/lon
    satellites = []
    for sat in snap["satellites"]:
        lat, lon = to_latlon(sat["x_km"], sat["y_km"], sat["z_km"])
        satellites.append({
            "id": sat["id"],
            "lat": lat,
            "lon": lon,
            "active": sat["active"],
        })
    
    # Маршруты
    routes = {}
    for client in clients:
        routes[client] = bfs(client, gateways_set, graph)
    
    # НОВОЕ: serving_satellites — какие спутники обслуживают каждый клиент
    serving_satellites = {}
    for client in clients:
        neighbors = graph.get(client, [])
        # Оставляем только спутники (начинаются с "S")
        sat_neighbors = [n for n in neighbors if n.startswith("S")]
        serving_satellites[client] = sat_neighbors
    
    return {
        "t_s": t_s,
        "satellites": satellites,
        "edges": snap["edges"],
        "routes": routes,
        "serving_satellites": serving_satellites,
    }
    
# ============================================================
# 5. ПРИМЕНЕНИЕ OVERRIDES
# ============================================================
def apply_overrides(scenario: dict, overrides: dict) -> dict:
    """
    Накладывает изменения на КОПИЮ сценария.
    Оригинал не трогает.
    
    overrides = {
        # environment (безопасные параметры)
        "altitude_km": 600,
        "inclination_deg": 85,
        "min_elevation_deg": 15,
        "isl_range_km": 2000,
        "target_availability": 0.85,
        
        # design
        "launch_stage": 2,
        "plane_overrides": [{"plane_id": "P1", "raan_deg": 45, "phase_deg": 10}],
        
        # события
        "failures": [{"satellite_id": "S20", "start_s": 21600, "end_s": 43200}],
        "gateway_outages": [{"gateway_id": "G_MUR", "start_s": 0, "end_s": 3600}],
    }
    """
    new_scenario = copy.deepcopy(scenario)
    env = new_scenario["environment"]
    design = new_scenario["design"]
    
    # ============================================================
    # ENVIRONMENT — безопасные параметры
    # ============================================================
    
    # Высота орбиты (200–1200 км)
    if "altitude_km" in overrides:
        val = overrides["altitude_km"]
        if not (200 <= val <= 1200):
            raise ValueError(f"altitude_km must be 200..1200, got {val}")
        env["altitude_km"] = val
    
    # Наклонение (0–180°)
    if "inclination_deg" in overrides:
        val = overrides["inclination_deg"]
        if not (0 < val <= 180):
            raise ValueError(f"inclination_deg must be 0..180, got {val}")
        env["inclination_deg"] = val
    
    # Минимальный угол возвышения (0–90°)
    if "min_elevation_deg" in overrides:
        val = overrides["min_elevation_deg"]
        if not (0 <= val < 90):
            raise ValueError(f"min_elevation_deg must be 0..90, got {val}")
        env["min_elevation_deg"] = val
    
    # Дальность ISL (0–10000 км)
    if "isl_range_km" in overrides:
        val = overrides["isl_range_km"]
        if not (0 < val <= 10000):
            raise ValueError(f"isl_range_km must be 0..10000, got {val}")
        env["isl_range_km"] = val
    
    # Целевая доступность (0–1)
    if "target_availability" in overrides:
        val = overrides["target_availability"]
        if not (0 <= val <= 1):
            raise ValueError(f"target_availability must be 0..1, got {val}")
        env["target_availability"] = val
    
    # ============================================================
    # DESIGN — launch_stage и плоскости
    # ============================================================
    
    if "launch_stage" in overrides:
        val = overrides["launch_stage"]
        if val not in (1, 2, 3):
            raise ValueError(f"launch_stage must be 1, 2 or 3, got {val}")
        design["launch_stage"] = val
    
    if "plane_overrides" in overrides:
        pmap = {p["id"]: p for p in design["planes"]}
        for po in overrides["plane_overrides"]:
            if po["plane_id"] not in pmap:
                raise ValueError(f"Unknown plane: {po['plane_id']}")
            if "raan_deg" in po:
                val = po["raan_deg"]
                if not (0 <= val < 360):
                    raise ValueError(f"raan_deg must be 0..360, got {val}")
                pmap[po["plane_id"]]["raan_deg"] = val
            if "phase_deg" in po:
                val = po["phase_deg"]
                if not (0 <= val < 360):
                    raise ValueError(f"phase_deg must be 0..360, got {val}")
                pmap[po["plane_id"]]["phase_deg"] = val
    
    # ============================================================
    # СОБЫТИЯ — отказы
    # ============================================================
    
    horizon_s = env["horizon_s"]
    
    if "failures" in overrides:
        sat_ids = {s["id"] for s in design["satellites"]}
        for f in overrides["failures"]:
            if f["satellite_id"] not in sat_ids:
                raise ValueError(f"Unknown satellite: {f['satellite_id']}")
            if not (0 <= f["start_s"] < f["end_s"] <= horizon_s):
                raise ValueError(f"Invalid failure interval: {f}")
            new_scenario["failures"].append({
                "satellite_id": f["satellite_id"],
                "start_s": f["start_s"],
                "end_s": f["end_s"],
            })
    
    if "gateway_outages" in overrides:
        gw_ids = {g["id"] for g in new_scenario["ground_sites"] if g["role"] == "gateway"}
        for g in overrides["gateway_outages"]:
            if g["gateway_id"] not in gw_ids:
                raise ValueError(f"Unknown gateway: {g['gateway_id']}")
            if not (0 <= g["start_s"] < g["end_s"] <= horizon_s):
                raise ValueError(f"Invalid gateway outage interval: {g}")
            new_scenario["gateway_outages"].append({
                "gateway_id": g["gateway_id"],
                "start_s": g["start_s"],
                "end_s": g["end_s"],
            })
    
    return new_scenario


# ============================================================
# 6. ПОЛНЫЙ РАСЧЁТ МЕТРИК
# ============================================================
def calculate(scenario: dict, overrides: dict | None = None) -> dict:
    if overrides:
        scenario = apply_overrides(scenario, overrides)
    
    validate(scenario)
    
    env = scenario["environment"]
    step_s = env["step_s"]
    horizon_s = env["horizon_s"]
    
    clients = [g["id"] for g in scenario["ground_sites"] if g["role"] == "client"]
    gateways = {g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway"}
    
    routes = []
    graphs_by_t = {}
    for t_s in range(0, horizon_s, step_s):
        snap = snapshot(scenario, t_s)
        graph = build_graph(snap["edges"])
        graphs_by_t[t_s] = graph
        for client in clients:
            path = bfs(client, gateways, graph)
            routes.append({"t_s": t_s, "client_id": client, "path": path})
    
    metrics = calc_metrics_with_reasons(
        routes, clients, step_s, scenario, graphs_by_t
    )
    
    return {
        "metrics": metrics,
        "target_availability": env["target_availability"],
        "routes_count": len(routes),
    }


# ============================================================
# 7. ВЫГРУЗКА РЕЗУЛЬТАТА (формат ТЗ)
# ============================================================

def export_result(scenario: dict, overrides: dict | None = None) -> dict:
    """
    Выгружает результат в формате cosmo-A-result-1.0.
    """
    if overrides:
        effective_scenario = apply_overrides(scenario, overrides)
    else:
        effective_scenario = copy.deepcopy(scenario)
    
    env = effective_scenario["environment"]
    step_s = env["step_s"]
    horizon_s = env["horizon_s"]
    
    clients = [g["id"] for g in effective_scenario["ground_sites"] if g["role"] == "client"]
    gateways = {g["id"] for g in effective_scenario["ground_sites"] if g["role"] == "gateway"}
    
    routes = []
    for t_s in range(0, horizon_s, step_s):
        snap = snapshot(effective_scenario, t_s)
        graph = build_graph(snap["edges"])
        for client in clients:
            path = bfs(client, gateways, graph)
            routes.append({
                "t_s": t_s,
                "client_id": client,
                "path": path,
            })
    
    return {
        "schema_version": "cosmo-A-result-1.0",
        "effective_scenario": effective_scenario,
        "routes": routes,
    }


# ============================================================
# 8. ЗАГРУЗКА СЦЕНАРИЯ
# ============================================================

def load_scenario(json_data: dict) -> dict:
    """
    Валидирует загруженный сценарий и возвращает структуру для UI.
    """
    validate(json_data)
    
    clients = [g["id"] for g in json_data["ground_sites"] if g["role"] == "client"]
    gateways = [g["id"] for g in json_data["ground_sites"] if g["role"] == "gateway"]
    satellites = [s["id"] for s in json_data["design"]["satellites"]]
    
    return {
        "meta": json_data.get("meta", {}),
        "environment": json_data["environment"],
        "clients": clients,
        "gateways": gateways,
        "satellites": satellites,
        "failures": json_data.get("failures", []),
        "gateway_outages": json_data.get("gateway_outages", []),
        "launch_stage": json_data["design"]["launch_stage"],
    }

def diagnose_no_route(client: str, graph: dict, scenario: dict, t_s: float) -> str:
    """
    Определяет причину отсутствия маршрута.
    Возвращает одну из строк:
      - "no_visible_satellite"  — у клиента нет видимых спутников
      - "gateway_unavailable"   — шлюз в отказе
      - "no_gateway_contact"    — у шлюза нет видимых спутников
      - "isl_network_broken"    — спутники есть, но сеть разорвана
    """
    env = scenario["environment"]
    horizon_s = env["horizon_s"]
    
    # 1. У клиента есть видимые спутники?
    client_neighbors = graph.get(client, [])
    if not client_neighbors:
        return "no_visible_satellite"
    
    # 2. Какие шлюзы активны в этот момент?
    active_gateways = []
    for g in scenario["ground_sites"]:
        if g["role"] != "gateway":
            continue
        # Проверяем gateway_outages
        offline = any(
            f["gateway_id"] == g["id"] and f["start_s"] <= t_s < f["end_s"]
            for f in scenario.get("gateway_outages", [])
        )
        if not offline:
            active_gateways.append(g["id"])
    
    if not active_gateways:
        return "gateway_unavailable"
    
    # 3. У активных шлюзов есть видимые спутники?
    gateway_has_sat = False
    for gw in active_gateways:
        if graph.get(gw):
            gateway_has_sat = True
            break
    if not gateway_has_sat:
        return "no_gateway_contact"
    
    return "isl_network_broken"



# ============================================================
# 9. СОХРАНЕНИЕ И СРАВНЕНИЕ ВАРИАНТОВ
# ============================================================

# In-memory хранилище вариантов (для хакатона — хватит)
_VARIANTS = {}


def save_variant(name: str, overrides: dict, description: str = "") -> dict:
    """
    Сохраняет вариант (overrides) под именем.
    Если имя уже есть — перезаписывает.
    """
    _VARIANTS[name] = {
        "name": name,
        "overrides": copy.deepcopy(overrides or {}),
        "description": description,
    }
    return {"status": "ok", "name": name, "total_variants": len(_VARIANTS)}


def list_variants() -> list:
    """Возвращает список сохранённых вариантов (без метрик)."""
    return [
        {
            "name": v["name"],
            "overrides": v["overrides"],
            "description": v["description"],
        }
        for v in _VARIANTS.values()
    ]


def delete_variant(name: str) -> dict:
    """Удаляет вариант по имени."""
    if name not in _VARIANTS:
        raise ValueError(f"Unknown variant: {name}")
    del _VARIANTS[name]
    return {"status": "ok", "name": name}


def compare_variants(scenario: dict, name_a: str, name_b: str) -> dict:
    """
    Сравнивает два сохранённых варианта.
    Прогоняет calculate для каждого и считает разницу.
    """
    if name_a not in _VARIANTS:
        raise ValueError(f"Unknown variant: {name_a}")
    if name_b not in _VARIANTS:
        raise ValueError(f"Unknown variant: {name_b}")
    
    var_a = _VARIANTS[name_a]
    var_b = _VARIANTS[name_b]
    
    result_a = calculate(scenario, var_a["overrides"])
    result_b = calculate(scenario, var_b["overrides"])
    
    # Считаем разницу по каждому клиенту
    diff = {}
    for client in result_a["metrics"]:
        m_a = result_a["metrics"][client]
        m_b = result_b["metrics"][client]
        diff[client] = {
            "path_pct": round(m_b["path_pct"] - m_a["path_pct"], 2),
            "max_gap_s": m_b["max_gap_s"] - m_a["max_gap_s"],
            "avg_hops": round(m_b["avg_hops"] - m_a["avg_hops"], 2),
        }
    
    return {
        "variant_a": {
            "name": name_a,
            "overrides": var_a["overrides"],
            "metrics": result_a["metrics"],
        },
        "variant_b": {
            "name": name_b,
            "overrides": var_b["overrides"],
            "metrics": result_b["metrics"],
        },
        "diff": diff,
    }