import sys
sys.path.insert(0, "/home/chelovek/Music/spase/work_for_work/tool")

from geometry import load
from api.handlers import get_ground_sites, get_satellites, calculate, apply_overrides

scenario = load("/home/chelovek/Desktop/work/Данные/01_full_constellation.json")

# 1. Наземные пункты
gs = get_ground_sites(scenario)
print("Клиенты:", [c["id"] for c in gs["clients"]])
print("Шлюзы:", [g["id"] for g in gs["gateways"]])
print()

# 2. Спутники в момент 43200
sats = get_satellites(scenario, 43200)
print(f"Спутников в t_s=43200: {len(sats['satellites'])}")
print(f"Первый: {sats['satellites'][0]}")
print()

# 3. Расчёт с отказом S20
result = calculate(scenario, overrides={
    "failures": [{"satellite_id": "S20", "start_s": 0, "end_s": 86400}]
})
print("Метрики с отказом S20:")
for cid, m in result["metrics"].items():
    print(f"  {cid}: {m['path_pct']}%")