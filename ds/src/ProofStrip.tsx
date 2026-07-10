import * as React from 'react';

/**
 * Pasek wyróżników pod hero. items: pary [strong, span] — np. ["15+ lat", "doświadczenia"].
 * wrap=false, gdy pasek siedzi wewnątrz innej sekcji (bez wrappera section+container).
 */
export interface ProofStripProps {
  items: [string, string][];
  wrap?: boolean;
}

export function ProofStrip({ items, wrap = true }: ProofStripProps) {
  const strip = (
    <div className="proof-strip rv">
      {items.map(([b, s], i) => (
        <div key={i}><strong>{b}</strong><span>{s}</span></div>
      ))}
    </div>
  );
  if (!wrap) return strip;
  return (
    <section className="sect" style={{ paddingBottom: 0 }}>
      <div className="container">{strip}</div>
    </section>
  );
}
