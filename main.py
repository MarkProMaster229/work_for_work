from __future__ import annotations
import sys

from geometry import load, snapshot
from core.simulation import collect_routes
from core.metrics import calc_metrics
from core.console import (
    print_ground_sites,
    print_satellites,
    print_header,
    print_reachability,
    print_metrics,
    print_target,
)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: python main.py scenario.json")
        return 1

    scenario = load(argv[1])

    # 1. Наземные станции — координаты берём из JSON (lat_deg/lon_deg)
    print_ground_sites(scenario)

    # 2. Спутники — координаты только из снапшота, на конкретный момент t_s
    snap0 = snapshot(scenario, 1000)# сюда передать секунды
    print_satellites(snap0, limit=10)

    # 3. Прогон по всему времени и метрики
    routes, clients, gateways = collect_routes(scenario)
    print_header(gateways, len(routes))
    print_reachability(routes, clients)

    metrics = calc_metrics(routes, clients, scenario["environment"]["step_s"])
    print_metrics(metrics, clients)
    print_target(metrics, clients)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))