import * as React from 'react';

/**
 * Lista FAQ (details/summary) z automatyczną numeracją 01…NN.
 * Pytanie (q) to czysty tekst; odpowiedź (a) może zawierać HTML (linki, <strong>).
 * 3-kolumnowy grid w main.css wymaga struktury .num + tekst + .ico.
 */
export interface FaqItem { q: string; a: string }
export interface FaqProps { items: FaqItem[] }

export function Faq({ items }: FaqProps) {
  return (
    <div className="faq rv">
      {items.map((item, i) => (
        <details key={i}>
          <summary><span className="num">{String(i + 1).padStart(2, '0')}</span> {item.q} <span className="ico" aria-hidden="true">+</span></summary>
          <p dangerouslySetInnerHTML={{ __html: item.a }} />
        </details>
      ))}
    </div>
  );
}
