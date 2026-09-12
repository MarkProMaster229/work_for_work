#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Тест-анализ: поиск наиболее уязвимых спутников группировки.

Для каждого сценария из папки scenar/ проекта:
  1. считаются базовые метрики доступности клиентов (без доп. отказов);
  2. по очереди отключается каждый спутник на весь горизонт моделирования;
  3. дельта средней доступности = критичность спутника;
  4. ВСЕ данные автоматически сохраняются в папку результатов:
       - <сценарий>.json           полный отчёт по сценарию (все спутники);
       - <сценарий>.csv            плоская таблица по всем спутникам;
       - critical_satellites.json  сводка по всем сценариям;
       - summary.md                markdown-отчёт для README;
       - run.log                   лог прогона.

Запуск:
    python3 critical_satellites_test.py
    python3 critical_satellites_test.py --pattern "0[12]*" --workers 8 --top 5
    python3 critical_satellites_test.py --scenar-dir /path/to/scenar --out-dir /path/to/out
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Автопоиск корня проекта (папка, где есть scenar/ или geometry.py)
# ---------------------------------------------------------------------------
def find_project_root(start: Path) -> Path:
    for cand in [start, *start.parents]:
        if (cand / "scenar").is_dir() or (cand / "geometry.py").exists():
            return cand
    return start


PROJECT_ROOT = find_project_root(Path(__file__).resolve().parent)
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from geometry import load              # noqa: E402
from api.handlers import calculate     # noqa: E402

_LOG_LINES: list[str] = []


def log(msg: str = "") -> None:
    print(msg, flush=True)
    _LOG_LINES.append(msg)


# ---------------------------------------------------------------------------
# Вспомогательные функции
# ---------------------------------------------------------------------------
def summarize(metrics: dict) -> tuple[float, dict]:
    """Средняя доступность по клиентам + словарь клиент -> path_pct."""
    clients = {c: m["path_pct"] for c, m in metrics.items()}
    avg = sum(clients.values()) / len(clients) if clients else 0.0
    return avg, clients


def _run_one(task):
    """Рабочая функция для процессов: сценарий + список отказов -> метрики."""
    scenario, _sat_id, failures = task
    res = calculate(scenario, overrides={"failures": failures})
    return res["metrics"]


class Progress:
    def __init__(self, total: int, label: str):
        self.total = total
        self.label = label
        self.step = max(1, total // 10)
        self.done = 0
        self.t0 = time.time()

    def tick(self):
        self.done += 1
        if self.done % self.step == 0 or self.done == self.total:
            el = time.time() - self.t0
            eta = el / self.done * (self.total - self.done)
            log(f"  [{self.done}/{self.total}] {self.label}: {el:.1f} с, ETA {eta:.0f} с")


def run_tasks(tasks: list, workers: int, prog: Progress) -> dict:
    """Прогон задач (последовательно или в процессах). Ошибки не роняют всё."""
    out = {}
    if workers <= 1 or len(tasks) < 2:
        for t in tasks:
            try:
                out[t[1]] = _run_one(t)
            except Exception as e:  # noqa: BLE001
                out[t[1]] = e
            prog.tick()
        return out
    with ProcessPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(_run_one, t): t[1] for t in tasks}
        for fut in as_completed(futs):
            sid = futs[fut]
            try:
                out[sid] = fut.result()
            except Exception as e:  # noqa: BLE001
                out[sid] = e
            prog.tick()
    return out


# ---------------------------------------------------------------------------
# Анализ одного сценария
# ---------------------------------------------------------------------------
def analyze_scenario(path: Path, args) -> dict:
    t0 = time.time()
    scenario = load(str(path))
    meta = scenario.get("meta", {})
    scen_id = meta.get("id", path.stem)
    env = scenario.get("environment", {})
    horizon = float(env.get("horizon_s", 86400))

    sats = scenario["design"]["satellites"]
    plane_of = {s["id"]: s.get("plane_id", "?") for s in sats}
    base_failures = list(scenario.get("failures") or [])
    already_failed = {f.get("satellite_id") for f in base_failures}

    log("=" * 78)
    log(f"Сценарий: {scen_id} ({path.name}) — {meta.get('title', '')}")
    log(f"Спутников: {len(sats)}, горизонт: {horizon:.0f} с, "
        f"режим отказов: {'replace' if args.replace_failures else 'append'}")

    # 1. Базовые метрики (сценарий как есть)
    base_metrics = calculate(scenario, overrides={})["metrics"]
    base_avg, base_clients = summarize(base_metrics)
    log("База: " + ", ".join(f"{c}={v}%" for c, v in base_clients.items())
        + f" | средняя {base_avg:.2f}%")
    log("")

    # 2. Задачи: отказ каждого спутника на весь горизонт
    tasks = []
    for s in sats:
        fail = {"satellite_id": s["id"], "start_s": 0, "end_s": horizon}
        failures = [fail] if args.replace_failures else base_failures + [fail]
        tasks.append((scenario, s["id"], failures))

    prog = Progress(len(tasks), "отказы спутников")
    raw = run_tasks(tasks, args.workers, prog)

    # 3. Сбор строк результатов
    rows, errors = [], []
    for s in sats:
        m = raw.get(s["id"])
        if isinstance(m, Exception):
            errors.append({"scenario": scen_id, "satellite_id": s["id"], "error": str(m)})
            rows.append({"satellite_id": s["id"], "plane_id": plane_of[s["id"]],
                         "already_failed": s["id"] in already_failed,
                         "avg_pct": None, "delta": None,
                         "min_client_pct": None, "clients": {}, "error": str(m)})
            continue
        avg, clients = summarize(m)
        rows.append({"satellite_id": s["id"], "plane_id": plane_of[s["id"]],
                     "already_failed": s["id"] in already_failed,
                     "avg_pct": round(avg, 2), "delta": round(avg - base_avg, 2),
                     "min_client_pct": round(min(clients.values()), 2) if clients else None,
                     "clients": clients})

    rows.sort(key=lambda r: (r["delta"] is None, r["delta"] if r["delta"] is not None else 0.0))
    valid = [r for r in rows if r["delta"] is not None]

    plane_stat: dict[str, list[float]] = {}
    for r in valid:
        plane_stat.setdefault(r["plane_id"], []).append(r["delta"])
    planes = {p: round(sum(v) / len(v), 2) for p, v in sorted(plane_stat.items())}

    report = {
        "scenario_id": scen_id,
        "title": meta.get("title", ""),
        "file": path.name,
        "fail_mode": "replace" if args.replace_failures else "append",
        "horizon_s": horizon,
        "satellites_total": len(sats),
        "clients": sorted(base_clients),
        "base_avg": round(base_avg, 2),
        "base_clients": base_clients,
        "planes_avg_delta": planes,
        "elapsed_s": round(time.time() - t0, 1),
        "critical": valid[: args.top],
        "non_critical": valid[-args.top:],
        "all": rows,
        "errors": errors,
    }

    # 4. Консольный вывод
    log("")
    log(f"ТОП-{args.top} КРИТИЧНЫХ (отказ роняет доступность сильнее всего)")
    print_rows(valid[: args.top])
    log("")
    log(f"ТОП-{args.top} НЕКРИТИЧНЫХ (отказ почти не влияет)")
    print_rows(valid[-args.top:])
    log("")
    return report


def print_rows(rows: list[dict]) -> None:
    log(f"{'Спутник':<10}{'Плоск.':<8}{'Средняя':>9}{'Δ':>9}  Клиенты")
    log("-" * 78)
    for r in rows:
        cl = ", ".join(f"{c}={v}%" for c, v in r["clients"].items())
        log(f"{r['satellite_id']:<10}{r['plane_id']:<8}"
            f"{r['avg_pct']:>9}{r['delta']:>9}  {cl}")


# ---------------------------------------------------------------------------
# Сохранение результатов
# ---------------------------------------------------------------------------
def save_scenario_csv(report: dict, path: Path) -> None:
    clients = report["clients"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["satellite_id", "plane_id", "already_failed",
                    "avg_pct", "delta", "min_client_pct", *clients, "error"])
        for r in report["all"]:
            w.writerow([r["satellite_id"], r["plane_id"], r["already_failed"],
                        r["avg_pct"], r["delta"], r["min_client_pct"],
                        *[r["clients"].get(c, "") for c in clients],
                        r.get("error", "")])


def build_markdown(summary: dict) -> str:
    L = ["# Критичность спутников группировки", "",
         f"_Сформировано: {summary['generated_at']}, режим отказов: {summary['fail_mode']}_", ""]
    for rep in summary["scenarios"].values():
        L += [f"## {rep['scenario_id']} — {rep['title']}", "",
              f"Файл: `{rep['file']}`, спутников: {rep['satellites_total']}, "
              f"базовая средняя доступность: **{rep['base_avg']}%**, "
              f"время расчёта: {rep['elapsed_s']} с", ""]
        if rep["planes_avg_delta"]:
            L += ["Средняя Δ по плоскостям: "
                  + ", ".join(f"{p}={v}" for p, v in rep["planes_avg_delta"].items()), ""]
        for title, key in (("Наиболее критичные", "critical"),
                           ("Наименее критичные", "non_critical")):
            L += [f"### {title}", "",
                  "| Спутник | Плоскость | Средняя, % | Δ, п.п. | Клиенты |",
                  "|---|---|---|---|---|"]
            for r in rep[key]:
                cl = ", ".join(f"{c}={v}" for c, v in r["clients"].items())
                L.append(f"| {r['satellite_id']} | {r['plane_id']} | "
                         f"{r['avg_pct']} | {r['delta']} | {cl} |")
            L.append("")
    return "\n".join(L)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def parse_args():
    p = argparse.ArgumentParser(description="Анализ критичности спутников по всем сценариям")
    p.add_argument("--scenar-dir", type=Path, default=None,
                   help=f"папка со сценариями (по умолчанию {PROJECT_ROOT / 'scenar'})")
    p.add_argument("--out-dir", type=Path, default=None,
                   help=f"папка результатов (по умолчанию {PROJECT_ROOT / 'results' / 'critical_satellites'})")
    p.add_argument("--pattern", default="*.json", help="glob-фильтр имён сценариев")
    p.add_argument("--top", type=int, default=10, help="размер ТОП-листов")
    p.add_argument("--workers", type=int, default=min(8, os.cpu_count() or 1),
                   help="число процессов (0/1 — последовательно)")
    p.add_argument("--replace-failures", action="store_true",
                   help="заменять собственные отказы сценария, а не добавлять к ним")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    scen_dir = args.scenar_dir or (PROJECT_ROOT / "scenar")
    out_dir = args.out_dir or (PROJECT_ROOT / "results" / "critical_satellites")

    if not scen_dir.is_dir():
        sys.exit(f"НЕ найдена папка со сценариями: {scenar_dir}\n"
                 f"Корень проекта определён как: {PROJECT_ROOT}\n"
                 f"Укажите путь через --scenar-dir")

    scenarios = sorted(scen_dir.glob(args.pattern))
    if not scenarios:
        sys.exit(f"В {scen_dir} нет файлов по маске '{args.pattern}'")

    out_dir.mkdir(parents=True, exist_ok=True)
    log(f"Корень проекта: {PROJECT_ROOT}")
    log(f"Сценариев к прогону: {len(scenarios)}: " + ", ".join(p.name for p in scenarios))
    log(f"Результаты будут сохранены в: {out_dir}")
    log("")

    summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "fail_mode": "replace" if args.replace_failures else "append",
        "workers": args.workers,
        "scenarios": {},
        "errors": [],
    }

    t_all = time.time()
    for path in scenarios:
        try:
            rep = analyze_scenario(path, args)
        except Exception as e:  # noqa: BLE001
            log(f"!! Ошибка сценария {path.name}: {e}")
            summary["errors"].append({"scenario": path.name, "error": str(e)})
            continue
        summary["scenarios"][rep["scenario_id"]] = rep
        save_scenario_csv(rep, out_dir / f"{rep['scenario_id']}.csv")
        with open(out_dir / f"{rep['scenario_id']}.json", "w", encoding="utf-8") as f:
            json.dump(rep, f, ensure_ascii=False, indent=2)

    summary["total_elapsed_s"] = round(time.time() - t_all, 1)

    with open(out_dir / "critical_satellites.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    with open(out_dir / "summary.md", "w", encoding="utf-8") as f:
        f.write(build_markdown(summary))

    log("=" * 78)
    log(f"Готово за {summary['total_elapsed_s']} с. Сохранено:")
    for p in sorted(out_dir.iterdir()):
        log(f"  - {p}")


if __name__ == "__main__":
    try:
        main()
    finally:
        try:
            log_path = Path(sys.argv[0]).resolve().parent / "run.log"
            log_path.write_text("\n".join(_LOG_LINES), encoding="utf-8")
        except OSError:
            pass