import * as React from 'react';

/**
 * Galeria screenshotów w siatce (domyślnie 3 kolumny) z podpisami.
 * Wersja statyczna — lightbox strony (klik = powiększenie) to osobny skrypt runtime.
 */
export interface ShotItem { src: string; alt: string; caption: string }
export interface ShotGalleryProps { items: ShotItem[]; cols?: number }

export function ShotGallery({ items, cols = 3 }: ShotGalleryProps) {
  return (
    <div className="shot-grid rv" style={{ ['--shot-cols' as any]: cols }}>
      {items.map((it, i) => (
        <figure className="shot" key={i} style={{ ['--rv-d' as any]: `${(i * 0.06).toFixed(2)}s` }}>
          <button type="button" className="shot-btn" data-shot-full={it.src} data-shot-alt={it.alt} aria-label={`Powiększ: ${it.caption}`}>
            <img src={it.src} alt={it.alt} loading="lazy" decoding="async" />
            <span className="shot-zoom" aria-hidden="true">⤢</span>
          </button>
          <figcaption>{it.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}
