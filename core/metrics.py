from __future__ import annotations


def calc_metrics(routes: list, clients: list, step_s: int) -> dict:
    """
    Считает базовые метрики по каждому клиенту.

    routes: [{"t_s": ..., "client_id": ..., "path": [...]}, ...]
    clients: ["C65", "C70", "C72"]
    step_s: шаг времени в секундах

    Возвращает: {client_id: {"path_pct": ..., "max_gap_s": ..., "avg_hops": ...}}
    """
    metrics = {}

    for client in clients:
        client_routes = sorted(
            (r for r in routes if r["client_id"] == client),
            key=lambda r: r["t_s"],
        )

        total = len(client_routes)
        if total == 0:
            metrics[client] = {"path_pct": 0.0, "max_gap_s": 0, "avg_hops": 0.0}
            continue

        found = sum(1 for r in client_routes if r["path"])
        path_pct = 100.0 * found / total

        max_gap_steps = 0
        current_gap = 0
        for r in client_routes:
            if not r["path"]:
                current_gap += 1
                max_gap_steps = max(max_gap_steps, current_gap)
            else:
                current_gap = 0
        max_gap_s = max_gap_steps * step_s

        hops_list = [len(r["path"]) - 1 for r in client_routes if r["path"]]
        avg_hops = sum(hops_list) / len(hops_list) if hops_list else 0.0

        metrics[client] = {
            "path_pct": round(path_pct, 2),
            "max_gap_s": max_gap_s,
            "avg_hops": round(avg_hops, 2),
        }

    return metrics


def diagnose_no_route(client: str, graph: dict, scenario: dict, t_s: float) -> str:
    """
    Определяет причину отсутствия маршрута.
    Возвращает одну из строк:
      - "no_visible_satellite"  — у клиента нет видимых спутников
      - "gateway_unavailable"   — все шлюзы в отказе
      - "no_gateway_contact"    — у шлюза нет видимых спутников
      - "isl_network_broken"    — спутники есть, но сеть разорвана
    """
    client_neighbors = graph.get(client, [])
    if not client_neighbors:
        return "no_visible_satellite"

    active_gateways = []
    for g in scenario["ground_sites"]:
        if g["role"] != "gateway":
            continue
        offline = any(
            f["gateway_id"] == g["id"] and f["start_s"] <= t_s < f["end_s"]
            for f in scenario.get("gateway_outages", [])
        )
        if not offline:
            active_gateways.append(g["id"])

    if not active_gateways:
        return "gateway_unavailable"

    gateway_has_sat = False
    for gw in active_gateways:
        if graph.get(gw):
            gateway_has_sat = True
            break
    if not gateway_has_sat:
        return "no_gateway_contact"

    return "isl_network_broken"


def calc_metrics_with_reasons(
    routes: list,
    clients: list,
    step_s: int,
    scenario: dict,
    graphs_by_t: dict,
    visibility: dict | None = None,
) -> dict:
    """
    Расширенная версия calc_metrics:
    - добавляет список перерывов (gaps)
    - добавляет разбивку по причинам (reasons)
    - добавляет долю времени видимости хотя бы одного спутника (visibility_pct)

    graphs_by_t: {t_s: graph} — графы для каждого момента,
                 нужны для диагностики причин.
    visibility:  {client_id: [bool, ...]} — по одному значению на t_s,
                 в том же порядке, что и routes.
    """
    metrics = {}
    visibility = visibility or {}

    for client in clients:
        client_routes = sorted(
            (r for r in routes if r["client_id"] == client),
            key=lambda r: r["t_s"],
        )

        total = len(client_routes)
        if total == 0:
            metrics[client] = {
                "path_pct": 0.0,
                "visibility_pct": 0.0,
                "max_gap_s": 0,
                "avg_hops": 0.0,
                "gaps": [],
                "reasons": {},
            }
            continue

        # 1. Доля времени с путём
        found = sum(1 for r in client_routes if r["path"])
        path_pct = 100.0 * found / total

        # 2. Перерывы + причины
        max_gap_steps = 0
        current_gap = 0
        gap_start = None
        gaps = []
        reasons_count = {}

        for r in client_routes:
            if not r["path"]:
                if current_gap == 0:
                    gap_start = r["t_s"]
                current_gap += 1
                max_gap_steps = max(max_gap_steps, current_gap)

                graph = graphs_by_t.get(r["t_s"])
                if graph:
                    reason = diagnose_no_route(client, graph, scenario, r["t_s"])
                    reasons_count[reason] = reasons_count.get(reason, 0) + 1
            else:
                if current_gap > 0:
                    gaps.append({
                        "start_s": gap_start,
                        "end_s": r["t_s"],
                        "duration_s": current_gap * step_s,
                    })
                current_gap = 0
                gap_start = None

        if current_gap > 0:
            gaps.append({
                "start_s": gap_start,
                "end_s": client_routes[-1]["t_s"] + step_s,
                "duration_s": current_gap * step_s,
            })

        max_gap_s = max_gap_steps * step_s
        hops_list = [len(r["path"]) - 1 for r in client_routes if r["path"]]
        avg_hops = sum(hops_list) / len(hops_list) if hops_list else 0.0

        # 3. Доля времени видимости хотя бы одного спутника
        vis_list = visibility.get(client, [])
        if vis_list:
            vis_pct = 100.0 * sum(1 for v in vis_list if v) / len(vis_list)
        else:
            vis_pct = 0.0

        metrics[client] = {
            "path_pct": round(path_pct, 2),
            "visibility_pct": round(vis_pct, 2),
            "max_gap_s": max_gap_s,
            "avg_hops": round(avg_hops, 2),
            "gaps": gaps,
            "reasons": reasons_count,
        }

    return metrics