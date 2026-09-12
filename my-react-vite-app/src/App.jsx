import React, { useState, useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl'; // Добавлен импорт библиотеки карты
import 'maplibre-gl/dist/maplibre-gl.css'; // Импортируем стили для карты
import './jabajaba.css'; 
import { api } from './api.jsx';

function transformBackendToGeoJSON(data, groundSites = []) {
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

  if (groundSites) {
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
  }

  if (data.edges) {
    for (const edge of data.edges) {
      const [a, b, dist] = edge;
      if (coordsMap[a] && coordsMap[b]) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [coordsMap[a], coordsMap[b]],
          },
          properties: {
            edge_type: 'link',
            distance: dist,
          },
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}

export default function App() {
  const [kpi, setKpi] = useState({
    minAvailability: '—',
    avgAvailability: '—',
    maxBreak: '—',
    activeKA: 0,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [pipeJoints, setPipeJoints] = useState([]);
  const [isPipeJerked, setIsPipeJerked] = useState(false);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const creamCardRef = useRef(null);
  const mainCardRef = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
 const spritesRef = useRef({ curl: null, corner: null, crest: null });
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [37.6173, 55.7558],
      zoom: 3,
      container: mapContainerRef.current,
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
            'match',
            ['get', 'node_type'],
            'ground_site', 8,
            'satellite', 6,
            6,
          ],
          'circle-color': [
            'match',
            ['get', 'node_type'],
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

      setLoading(false);
    });

    return () => map.remove();
  }, []);

  useEffect(() => {
    api.getGroundSites().then((data) => {
      groundSitesRef.current = [...(data.clients || []), ...(data.gateways || [])];
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (loading || !mapRef.current) return;

    api.getSnapshot(currentTime)
      .then((data) => {
        const geojson = transformBackendToGeoJSON(data, groundSitesRef.current);
        const source = mapRef.current.getSource('graph-source');
        if (source) {
          source.setData(geojson);
        }
      })
      .catch((err) => {
        console.error("Ошибка при обновлении карты:", err);
      });
  }, [currentTime, loading]);

  useEffect(() => {
    buildPipe();
    window.addEventListener('resize', handleResize);

    const loadSprite = (path) => {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ url: path, width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error('Не удалось загрузить файл ' + path));
        image.src = path;
      });
    };

    Promise.all([
      loadSprite('sprites/curl.png').catch(() => null),
      loadSprite('sprites/corner.png').catch(() => null),
      loadSprite('sprites/crest.png').catch(() => null),
    ]).then(([curl, corner, crest]) => {
      spritesRef.current = { curl, corner, crest };
      updateAllFrames();
    });

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleResize = () => {
    buildPipe();
    updateAllFrames();
  };

  const updateAllFrames = () => {
    if (creamCardRef.current) layoutFrame(creamCardRef.current);
    if (mainCardRef.current) layoutFrame(mainCardRef.current);
  };

  const buildPipe = () => {
    const height = window.innerHeight;
    let spots = [0.18, 0.51, 0.86];
    if (Math.random() < 0.35) {
      spots = [0.28, 0.74];
    }
    const joints = spots.map((spot) => Math.round(height * spot));
    setPipeJoints(joints);
  };

  const handlePipeClick = () => {
    setIsPipeJerked(false);
    setTimeout(() => setIsPipeJerked(true), 0);
  };

  const paintPiece = (style, sprite, repeat, width, height) => {
    style.maskImage = `url(${sprite.url})`;
    style.webkitMaskImage = `url(${sprite.url})`;
    style.maskRepeat = repeat;
    style.webkitMaskRepeat = repeat;
    style.maskSize = `${width}px ${height}px`;
    style.webkitMaskSize = `${width}px ${height}px`;
  };

  const layoutFrame = (card) => {
    const { curl, corner, crest } = spritesRef.current;
    if (!curl || !corner) return;

    const width = card.clientWidth;
    const height = card.clientHeight;
    if (!width || !height || width < 90 || height < 90) return;

    const frame = card.querySelector('.nz');
    if (!frame) return;

    const piece = (name) => frame.querySelector(`[data-k="${name}"]`);
    const place = (el, left, top, w, h, transform) => {
      if (!el) return;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.transform = transform;
    };

    const band = Math.min(30, height * 0.22);
    let cornerSize = Math.min(88, width * 0.34);
    let cornerH = cornerSize * (corner.height / corner.width);

    if (cornerH > height * 0.34) {
      cornerH = height * 0.34;
      cornerSize = cornerH * (corner.width / corner.height);
    }
    const overlap = Math.min(cornerSize * 0.35, 26);
    const tileBase = band * (curl.width / curl.height);

    const lineH = Math.max(tileBase, width - 2 * (cornerSize - band) + 2 * overlap);
    const countH = Math.max(1, Math.round(lineH / tileBase));
    const tileH = lineH / countH;

    const lineV = Math.max(tileBase, height - 2 * (cornerH - band) + 2 * overlap);
    const countV = Math.max(1, Math.round(lineV / tileBase));
    const tileV = lineV / countV;

    const et = piece('e-t');
    place(et, cornerSize - band - overlap, -band, lineH, band, 'none');
    if (et) { et.style.transformOrigin = 'top left'; paintPiece(et.style, curl, 'repeat-x', tileH, band); }

    const eb = piece('e-b');
    place(eb, cornerSize - band - overlap, height, lineH, band, 'scaleY(-1)');
    if (eb) { eb.style.transformOrigin = 'center'; paintPiece(eb.style, curl, 'repeat-x', tileH, band); }

    const el = piece('e-l');
    place(el, -band, height - (cornerH - band) + overlap, lineV, band, 'rotate(-90deg)');
    if (el) { el.style.transformOrigin = 'top left'; paintPiece(el.style, curl, 'repeat-x', tileV, band); }

    const er = piece('e-r');
    place(er, width + band, cornerH - band - overlap, lineV, band, 'rotate(90deg)');
    if (er) { er.style.transformOrigin = 'top left'; paintPiece(er.style, curl, 'repeat-x', tileV, band); }

    if (piece('c-tl')) { place(piece('c-tl'), -band, -band, cornerSize, cornerH, 'none'); paintPiece(piece('c-tl').style, corner, 'no-repeat', cornerSize, cornerH); }
    if (piece('c-tr')) { place(piece('c-tr'), width + band - cornerSize, -band, cornerSize, cornerH, 'scaleX(-1)'); paintPiece(piece('c-tr').style, corner, 'no-repeat', cornerSize, cornerH); }
    if (piece('c-bl')) { place(piece('c-bl'), -band, height + band - cornerH, cornerSize, cornerH, 'scaleY(-1)'); paintPiece(piece('c-bl').style, corner, 'no-repeat', cornerSize, cornerH); }
    if (piece('c-br')) { place(piece('c-br'), width + band - cornerSize, height + band - cornerH, cornerSize, cornerH, 'scale(-1,-1)'); paintPiece(piece('c-br').style, corner, 'no-repeat', cornerSize, cornerH); }

    const crestPiece = piece('crest');
    if (crestPiece) {
      if (crest && height > 240 && width > 320) {
        let crestH = band * 1.8;
        let crestW = crestH * (crest.width / crest.height);
        if (crestW > width * 0.6) {
          crestW = width * 0.6;
          crestH = crestW * (crest.height / crest.width);
        }
        crestPiece.style.display = 'block';
        place(crestPiece, (width - crestW) / 2, -crestH / 2, crestW, crestH, 'none');
        paintPiece(crestPiece.style, crest, 'no-repeat', crestW, crestH);
      } else {
        crestPiece.style.display = 'none';
      }
    }
  };

  const FrameDecoration = () => (
    <div className="nz">
      {['c-tl', 'c-tr', 'c-bl', 'c-br', 'e-t', 'e-b', 'e-l', 'e-r', 'crest'].map((name) => (
        <i key={name} data-k={name}></i>
      ))}
    </div>
  );

  return (
    <div className="app">
      <div className="layout">

        <section className="card nal-cream" ref={creamCardRef}>
          <div className="kpi-grid">
            <div className="kpi-cell">
              <div className="k-l">Доступность · мин. по пунктам</div>
              <div className="k-v">{kpi.minAvailability}</div>
            </div>
            <div className="kpi-cell">
              <div className="k-l">Доступность · средняя</div>
              <div className="k-v">{kpi.avgAvailability}</div>
            </div>
            <div className="kpi-cell">
              <div className="k-l">Макс. перерыв связи</div>
              <div className="k-v">{kpi.maxBreak}</div>
            </div>
            <div className="kpi-cell">
              <div className="k-l">Активные КА сейчас</div>
              <div className="k-v">{kpi.activeKA}</div>
            </div>
          </div>
          <FrameDecoration />
        </section>

        <section className="card main-panel" ref={mainCardRef}>
          <div>
            <div className="mp-sign" id="sign">Название</div>
            <div className="mp-btns">
                           <input 
                type="file" 
                
                style={{ display: 'none' }} 
                accept=".json"
                
              />

              {/* ОБНОВЛЕННАЯ КНОПКА */}
              <button 
                className="btn" 
                
              >
                ⬆ Загрузить сценарий
              </button>

              <button className="btn">⬇ Выгрузить</button>
              <button className="btn" onClick={() => setIsLoading(!isLoading)}>
                {isLoading ? '⏸ Хватит загружаться' : '▶ Тест загрузки'}
              </button>
            </div>
          </div>
          <FrameDecoration />
        </section>

        <section className="card map-panel" style={{ position: 'relative', minHeight: '450px', flexGrow: 1 }}>
          {/* Сам контейнер, куда MapLibre вставит холст */}
          <div 
            ref={mapContainerRef} 
            style={{ width: '100%', height: '500px', borderRadius: '4px', overflow: 'hidden' }} 
          />

          <div className="map-time-control" style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            background: 'rgba(255, 255, 255, 0.9)',
            padding: '12px 16px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 10,
            pointerEvents: 'auto',
          }}>
            <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Мониторинг временной шкалы
            </div>
            <div style={{ margin: '4px 0 8px 0', fontSize: '16px', fontWeight: 'bold' }}>
              t_s = {currentTime} сек.
            </div>
            <input
              type="range"
              min="0"
              max="3600"
              step="10"
              value={currentTime}
              onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
              style={{ width: '180px', display: 'block', cursor: 'pointer' }}
            />
            {loading && (
              <span style={{ fontSize: '10px', color: '#f59e0b', display: 'block', marginTop: '4px' }}>
                Синхронизация потока...
              </span>
            )}
          </div>

          <FrameDecoration />
        </section>

      </div>

      <div
        id="pipe"
        title="Газовая труба · можно дёрнуть"
        className={isPipeJerked ? 'jerk' : ''}
        onClick={handlePipeClick}
        onAnimationEnd={() => setIsPipeJerked(false)}
      >
        <div className="pipe-body"></div>
        {pipeJoints.map((top, idx) => (
          <i key={idx} className="pipe-joint" style={{ top: `${top}px` }}></i>
        ))}
      </div>

      <div id="loadOvl" className={isLoading ? 'show' : ''} onClick={() => setIsLoading(false)}>
        <div className="frame">
          <img id="loadImg" src="sprites/loading.gif" alt="Загрузка" />
        </div>
        <div className="lt">ЗАГРУЗКА ДАННЫХ…</div>
      </div>
    </div>
  );
}