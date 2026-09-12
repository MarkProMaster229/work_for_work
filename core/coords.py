from __future__ import annotations
import math

EARTH_RADIUS_KM = 6371.0
_EPS = 1e-9


def to_latlon(x_km: float, y_km: float, z_km: float) -> tuple[float, float]:
    """Декартовы (центр Земли) → (lat_deg, lon_deg). Без округления."""
    r = math.sqrt(x_km * x_km + y_km * y_km + z_km * z_km)
    if r < _EPS:
        return 0.0, 0.0
    sin_lat = max(-1.0, min(1.0, z_km / r))
    lat = math.degrees(math.asin(sin_lat))
    lon = math.degrees(math.atan2(y_km, x_km))
    return lat, lon


def to_cartesian(lat_deg: float, lon_deg: float, r_km: float) -> tuple[float, float, float]:
    lat, lon = math.radians(lat_deg), math.radians(lon_deg)
    return (
        r_km * math.cos(lat) * math.cos(lon),
        r_km * math.cos(lat) * math.sin(lon),
        r_km * math.sin(lat),
    )


def radius_km(x_km: float, y_km: float, z_km: float) -> float:
    return math.sqrt(x_km * x_km + y_km * y_km + z_km * z_km)


def altitude_km(x_km: float, y_km: float, z_km: float,
                earth_radius_km: float = EARTH_RADIUS_KM) -> float:
    return radius_km(x_km, y_km, z_km) - earth_radius_km


def central_angle_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.asin(min(1.0, math.sqrt(a)))
    return math.degrees(c)


def great_circle_km(lat1: float, lon1: float, lat2: float, lon2: float,
                    earth_radius_km: float = EARTH_RADIUS_KM) -> float:
    return math.radians(central_angle_deg(lat1, lon1, lat2, lon2)) * earth_radius_km


def ground_xyz(site: dict, earth_radius_km: float = EARTH_RADIUS_KM) -> tuple[float, float, float]:
    """
    Декартовы координаты наземной станции из её lat_deg / lon_deg.
    Полностью повторяет ground_position() из geometry.py.
    """
    return to_cartesian(site["lat_deg"], site["lon_deg"], earth_radius_km)