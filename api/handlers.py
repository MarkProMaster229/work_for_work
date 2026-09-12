"""
Модули реакции — принимают данные от фронта, вызывают core, возвращают результат.
"""
from __future__ import annotations
import copy
import sys
from pathlib import Path

# Импорты из core (предполагаем, что модули уже написаны)
from core.graph import build_graph
from core.simulation import bfs
from core.metrics import calc_metrics
from core.coords import to_latlon

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

def get_routes(scenario: dict, t_s: float) -> dict:
    """
    Возвращает маршруты от клиентов до шлюзов в момент t_s.
    """
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

def get_snapshot(scenario: dict, t_s: float) -> dict:
    """
    Полный snapshot для карты: спутники, связи, маршруты.
    """
    snap = snapshot(scenario, t_s)
    graph = build_graph(snap["edges"])
    
    clients = [g["id"] for g in scenario["ground_sites"] if g["role"] == "client"]
    gateways = {g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway"}
    
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
        routes[client] = bfs(client, gateways, graph)
    
    return {
        "t_s": t_s,
        "satellites": satellites,
        "edges": snap["edges"],
        "routes": routes,
    }


# ============================================================
# 5. ПРИМЕНЕНИЕ OVERRIDES
# ============================================================

def apply_overrides(scenario: dict, overrides: dict) -> dict:
    """
    Накладывает изменения на КОПИЮ сценария.
    Оригинал не трогает.
    
    overrides = {
        "launch_stage": 2,
        "isl_range_km": 2000,
        "plane_overrides": [{"plane_id": "P1", "raan_deg": 45, "phase_deg": 10}],
        "failures": [{"satellite_id": "S20", "start_s": 21600, "end_s": 43200}],
        "gateway_outages": [{"gateway_id": "G_MUR", "start_s": 0, "end_s": 3600}],
    }
    """
    new_scenario = copy.deepcopy(scenario)
    
    # 1. launch_stage
    if "launch_stage" in overrides:
        new_scenario["design"]["launch_stage"] = overrides["launch_stage"]
    
    # 2. isl_range_km
    if "isl_range_km" in overrides:
        new_scenario["environment"]["isl_range_km"] = overrides["isl_range_km"]
    
    # 3. Изменения плоскостей
    if "plane_overrides" in overrides:
        pmap = {p["id"]: p for p in new_scenario["design"]["planes"]}
        for po in overrides["plane_overrides"]:
            if po["plane_id"] in pmap:
                if "raan_deg" in po:
                    pmap[po["plane_id"]]["raan_deg"] = po["raan_deg"]
                if "phase_deg" in po:
                    pmap[po["plane_id"]]["phase_deg"] = po["phase_deg"]
    
    # 4. Отказы спутников (добавляем к существующим)
    if "failures" in overrides:
        for f in overrides["failures"]:
            new_scenario["failures"].append({
                "satellite_id": f["satellite_id"],
                "start_s": f["start_s"],
                "end_s": f["end_s"],
            })
    
    # 5. Отказы шлюзов
    if "gateway_outages" in overrides:
        for g in overrides["gateway_outages"]:
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
    """
    Полный расчёт метрик за весь период с учётом overrides.
    Это главная точка входа для кнопки "Применить".
    """
    if overrides:
        scenario = apply_overrides(scenario, overrides)
    
    # Валидируем (на случай, если overrides что-то сломали)
    validate(scenario)
    
    env = scenario["environment"]
    step_s = env["step_s"]
    horizon_s = env["horizon_s"]
    
    clients = [g["id"] for g in scenario["ground_sites"] if g["role"] == "client"]
    gateways = {g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway"}
    
    # Цикл по времени
    routes = []
    for t_s in range(0, horizon_s, step_s):
        snap = snapshot(scenario, t_s)
        graph = build_graph(snap["edges"])
        for client in clients:
            path = bfs(client, gateways, graph)
            routes.append({"t_s": t_s, "client_id": client, "path": path})
    
    # Метрики
    metrics = calc_metrics(routes, clients, step_s)
    
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