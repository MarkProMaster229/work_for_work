from __future__ import annotations


def print_header(gateways: set, total_records: int) -> None:
    print(f"Всего записей: {total_records}")
    print(f"Шлюзы: {gateways}")
    print()


def print_reachability(routes: list, clients: list) -> None:
    for client in clients:
        client_routes = [r for r in routes if r["client_id"] == client]
        found = sum(1 for r in client_routes if r["path"])
        total = len(client_routes)
        print(f"{client}: путь найден в {found}/{total} моментов ({100*found/total:.1f}%)")


def print_metrics(metrics: dict, clients: list) -> None:
    print("МЕТРИКИ:")
    print()
    for client in clients:
        m = metrics[client]
        print(f"{client}:")
        print(f"   Доля времени с путём: {m['path_pct']}%")
        print(f"   Макс. перерыв: {m['max_gap_s']} с ({m['max_gap_s']/60:.1f} мин)")
        print(f"   Средние hops: {m['avg_hops']}")
        print()


def print_target(metrics: dict, clients: list, target_pct: float = 90.0) -> None:
    print(f"ЦЕЛЕВОЙ ОРИЕНТИР: {target_pct:.0f}% доступности")
    for client in clients:
        pct = metrics[client]["path_pct"]
        status = "OK" if pct >= target_pct else "НЕ ДОСТИГНУТ"
        print(f"   {client}: {pct}% [{status}]")


from core.coords import ground_xyz, altitude_km, to_latlon


def print_ground_sites(scenario: dict) -> None:
    """Печатает все наземные станции из JSON (lat/lon там есть изначально)."""
    print("НАЗЕМНЫЕ СТАНЦИИ:")
    for g in scenario["ground_sites"]:
        x, y, z = ground_xyz(g)
        lat, lon = to_latlon(x, y, z)
        h = altitude_km(x, y, z)
        print(f"  {g['id']:<12} role={g['role']:<8} "
              f"lat={lat:8.4f} lon={lon:9.4f} h={h:6.1f} км")
    print()


def print_satellites(snap: dict, limit: int = 10) -> None:
    """Печатает первые N активных спутников из снапшота."""
    sats = [s for s in snap["satellites"] if s["active"]]
    print(f"СПУТНИКИ (t_s={snap['t_s']}, активно {len(sats)}):")
    for s in sats[:limit]:
        lat, lon = to_latlon(s["x_km"], s["y_km"], s["z_km"])
        h = altitude_km(s["x_km"], s["y_km"], s["z_km"])
        print(f"  {s['id']:<12} lat={lat:8.4f} lon={lon:9.4f} h={h:6.1f} км")
    if len(sats) > limit:
        print(f"  ... ещё {len(sats) - limit}")
    print()