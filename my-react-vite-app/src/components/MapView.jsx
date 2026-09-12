import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function MapView({ geojson, onLoaded }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [37.6173, 55.7558],
      zoom: 3,
      container: containerRef.current,
    });

    mapRef.current = map;

    map.on('load', () => {
      map.addSource('graph-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'graph-edges',
        type: 'line',
        source: 'graph-source',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': '#3b82f6',
          'line-width': 3,
          'line-opacity': 0.7,
        },
      });

      map.addLayer({
        id: 'graph-nodes',
        type: 'circle',
        source: 'graph-source',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': [
            'match', ['get', 'node_type'],
            'ground_site', 8,
            'satellite', 6,
            6,
          ],
          'circle-color': [
            'match', ['get', 'node_type'],
            'ground_site', '#10b981',
            'satellite', '#ef4444',
            '#ef4444',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.on('click', 'graph-nodes', (e) => {
        const feature = e.features[0];
        const coordinates = feature.geometry.coordinates.slice();
        const props = feature.properties;

        const popupContent = `
          <div style="font-family: sans-serif; padding: 5px; min-width: 150px;">
            <strong style="font-size: 14px; color: ${props.node_type === 'satellite' ? '#ef4444' : '#10b981'};">
              ${props.name}
            </strong>
            <hr style="margin: 5px 0; border: 0; border-top: 1px solid #eee;">
            <p style="margin: 0 0 3px 0;"><b>ID:</b> ${props.node_id}</p>
            <p style="margin: 0; color: #666; font-size: 11px;">
              <b>Координаты:</b> ${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}
            </p>
          </div>
        `;

        new maplibregl.Popup({ offset: 10 })
          .setLngLat(coordinates)
          .setHTML(popupContent)
          .addTo(map);
      });

      map.on('mouseenter', 'graph-nodes', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'graph-nodes', () => { map.getCanvas().style.cursor = ''; });

      onLoaded?.();
    });

    map.on('error', (e) => console.error('MapLibre error:', e?.error || e));

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Обновление данных на карте
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('graph-source');
    if (source) source.setData(geojson);
  }, [geojson]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '500px', borderRadius: '4px', overflow: 'hidden' }}
    />
  );
}