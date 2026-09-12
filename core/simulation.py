from __future__ import annotations

from geometry import snapshot
from core.graph import build_graph, bfs


def collect_routes(scenario: dict) -> tuple[list, list, set, dict]:
    """
    Прогоняет сценарий по времени, собирает маршруты и видимость.

    Возвращает:
      routes     — [{"t_s": ..., "client_id": ..., "path": [...]}, ...]
      clients    — ["C65", "C70", "C72"]
      gateways   — {"G_MUR"}
      visibility — {client_id: [bool, bool, ...]}
                   по одному значению на каждый t_s; True если хотя бы один
                   активный спутник виден из клиента под углом
                   >= min_elevation_deg.
    """
    clients = [g["id"] for g in scenario["ground_sites"] if g["role"] == "client"]
    gateways = {g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway"}

    env = scenario["environment"]
    horizon = env["horizon_s"]
    step = env["step_s"]
    min_elev = env["min_elevation_deg"]

    routes: list = []
    visibility: dict = {cid: [] for cid in clients}

    for t_s in range(0, horizon, step):
        snap = snapshot(scenario, t_s)

        # --- видимость ---
        # snap["elevation_deg"] = {ground_id: {sat_id: elev_deg}, ...}
        # попадают только активные спутники (geometry.py уже их отфильтровал)
        elevation = snap.get("elevation_deg", {})
        for client in clients:
            elevs = elevation.get(client, {})
            visible = any(e >= min_elev for e in elevs.values())
            visibility[client].append(visible)

        # --- маршруты ---
        graph = build_graph(snap["edges"])
        for client in clients:
            path = bfs(client, gateways, graph)
            routes.append({
                "t_s": t_s,
                "client_id": client,
                "path": path,
            })

    return routes, clients, gateways, visibility