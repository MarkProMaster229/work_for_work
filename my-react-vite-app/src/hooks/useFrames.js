import { useCallback, useEffect, useRef } from 'react';

export function useFrames(refs) {
  const spritesRef = useRef({ curl: null, corner: null, crest: null });

  const paintPiece = (style, sprite, repeat, width, height) => {
    style.maskImage = `url(${sprite.url})`;
    style.webkitMaskImage = `url(${sprite.url})`;
    style.maskRepeat = repeat;
    style.webkitMaskRepeat = repeat;
    style.maskSize = `${width}px ${height}px`;
    style.webkitMaskSize = `${width}px ${height}px`;
  };

  const layoutFrame = useCallback((card) => {
    const { curl, corner, crest } = spritesRef.current;
    if (!curl || !corner || !card) return;

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

    const corners = [
      ['c-tl', -band, -band, 'none'],
      ['c-tr', width + band - cornerSize, -band, 'scaleX(-1)'],
      ['c-bl', -band, height + band - cornerH, 'scaleY(-1)'],
      ['c-br', width + band - cornerSize, height + band - cornerH, 'scale(-1,-1)'],
    ];
    for (const [name, l, t, tr] of corners) {
      const p = piece(name);
      if (p) {
        place(p, l, t, cornerSize, cornerH, tr);
        paintPiece(p.style, corner, 'no-repeat', cornerSize, cornerH);
      }
    }

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
  }, []);

  const updateAll = useCallback(() => {
    refs.forEach((r) => r.current && layoutFrame(r.current));
  }, [refs, layoutFrame]);

  useEffect(() => {
    const loadSprite = (path) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ url: path, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Не удалось загрузить ' + path));
      img.src = path;
    });

    Promise.all([
      loadSprite('sprites/curl.png').catch(() => null),
      loadSprite('sprites/corner.png').catch(() => null),
      loadSprite('sprites/crest.png').catch(() => null),
    ]).then(([curl, corner, crest]) => {
      spritesRef.current = { curl, corner, crest };
      updateAll();
    });

    window.addEventListener('resize', updateAll);
    return () => window.removeEventListener('resize', updateAll);
  }, [updateAll]);

  return { updateAll };
}