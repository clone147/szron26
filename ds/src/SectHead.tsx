import * as React from 'react';

/**
 * Nagłówek sekcji: eyebrow (uppercase label) + h2, opcjonalny lead jako children
 * (np. <p className="sect-lead rv">…</p>). small → wariant sect-title--s.
 */
export interface SectHeadProps {
  eyebrow: string;
  title: string;
  id?: string;
  small?: boolean;
  children?: React.ReactNode;
}

export function SectHead({ eyebrow, title, id, small = false, children }: SectHeadProps) {
  return (
    <div className="sect-head">
      <p className="eyebrow rv" data-scramble="">{eyebrow}</p>
      <h2 className={small ? 'sect-title sect-title--s ws' : 'sect-title ws'} id={id}>{title}</h2>
      {children ?? ' '}
    </div>
  );
}
