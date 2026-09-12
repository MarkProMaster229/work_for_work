from __future__ import annotations

from geometry import snapshot
from core.graph import build_graph, bfs


def collect_routes(scenario: dict) -> tuple[list, list, set]:
    """
    Прогоняет сценарий по времени и собирает маршруты.

    Возвращает: (routes, clients, gateways)
    """
    clients = [g["id"] for g in scenario["ground_sites"] if g["role"] == "client"]
    gateways = {g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway"}

    env = scenario["environment"]
    routes = []

    for t_s in range(0, env["horizon_s"], env["step_s"]):
        snap = snapshot(scenario, t_s)
        graph = build_graph(snap["edges"])
        for client in clients:
            path = bfs(client, gateways, graph)
            routes.append({
                "t_s": t_s,
                "client_id": client,
                "path": path,
            })

    return routes, clients, gateways