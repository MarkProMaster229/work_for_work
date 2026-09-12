export function transformBackendToGeoJSON(data, groundSites = []) {
  const features = [];
  const coordsMap = {};

  if (data.satellites) {
    for (const sat of data.satellites) {
      coordsMap[sat.id] = [sat.lon, sat.lat];
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [sat.lon, sat.lat] },
        properties: {
          node_type: "satellite",
          node_id: sat.id,
          name: sat.id,
          active: sat.active === true,
        },
      });
    }
  }

  for (const site of groundSites) {
    coordsMap[site.id] = [site.lon, site.lat];
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [site.lon, site.lat] },
      properties: {
        node_type: "ground_site",
        node_id: site.id,
        name: site.name || site.id,
        role: site.role,
      },
    });
  }

  if (data.edges) {
    for (const [a, b, dist] of data.edges) {
      if (coordsMap[a] && coordsMap[b]) {
        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [coordsMap[a], coordsMap[b]],
          },
          properties: { edge_type: "link", distance: dist },
        });
      }
    }
  }

  return { type: "FeatureCollection", features };
}

/**
 * Строит GeoJSON LineString по маршруту выбранного клиента
 * из data.routes[clientId] = ["C65", "S20", "G_MUR"].
 */
export function buildRouteGeoJSON(data, groundSites, selectedClient) {
  if (!selectedClient) return emptyFC();
  const path = data?.routes?.[selectedClient];
  if (!Array.isArray(path) || path.length < 2) return emptyFC();

  const coordsMap = {};
  for (const s of data.satellites || []) coordsMap[s.id] = [s.lon, s.lat];
  for (const g of groundSites || []) coordsMap[g.id] = [g.lon, g.lat];

  const coords = [];
  for (const id of path) {
    if (coordsMap[id]) coords.push(coordsMap[id]);
  }
  if (coords.length < 2) return emptyFC();

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { client_id: selectedClient, hops: path.length - 1 },
      },
    ],
  };
}

function emptyFC() {
  return { type: "FeatureCollection", features: [] };
}

/**
 * Сводка метрик по клиентам из ответа POST /api/calculate.
 */
export function summarizeMetrics(calcResult) {
  const metrics = calcResult?.metrics || {};
  const ids = Object.keys(metrics);
  if (!ids.length) {
    return {
      perClient: {},
      minAvailability: null,
      avgAvailability: null,
      maxBreak: null,
    };
  }
  const pcts = ids.map((id) => metrics[id].path_pct ?? 0);
  const breaks = ids.map((id) => metrics[id].max_gap_s ?? 0);
  return {
    perClient: metrics,
    minAvailability: Math.min(...pcts),
    avgAvailability: pcts.reduce((a, b) => a + b, 0) / pcts.length,
    maxBreak: Math.max(...breaks),
  };
}