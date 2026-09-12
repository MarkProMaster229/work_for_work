from __future__ import annotations


def calc_metrics(routes: list, clients: list, step_s: int) -> dict:
    """
    Считает метрики по каждому клиенту.

    routes: список словарей {"t_s": ..., "client_id": ..., "path": [...]}
    clients: список ID клиентов
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

        # 1. Доля времени с путём
        found = sum(1 for r in client_routes if r["path"])
        path_pct = 100.0 * found / total

        # 2. Максимальный перерыв
        max_gap_steps = 0
        current_gap = 0
        for r in client_routes:
            if not r["path"]:
                current_gap += 1
                max_gap_steps = max(max_gap_steps, current_gap)
            else:
                current_gap = 0
        max_gap_s = max_gap_steps * step_s

        # 3. Средние hops
        hops_list = [len(r["path"]) - 1 for r in client_routes if r["path"]]
        avg_hops = sum(hops_list) / len(hops_list) if hops_list else 0.0

        metrics[client] = {
            "path_pct": round(path_pct, 2),
            "max_gap_s": max_gap_s,
            "avg_hops": round(avg_hops, 2),
        }

    return metrics