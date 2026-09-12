export function transformBackendToGeoJSON(data, groundSites = []) {
  const features = [];
  const coordsMap = {};

  if (data.satellites) {
    for (const sat of data.satellites) {
      coordsMap[sat.id] = [sat.lon, sat.lat];
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [sat.lon, sat.lat] },
        properties: {
          node_type: 'satellite',
          node_id: sat.id,
          name: sat.id,
          active: sat.active,
        },
      });
    }
  }

  for (const site of groundSites) {
    coordsMap[site.id] = [site.lon, site.lat];
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [site.lon, site.lat] },
      properties: {
        node_type: 'ground_site',
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
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [coordsMap[a], coordsMap[b]],
          },
          properties: { edge_type: 'link', distance: dist },
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}