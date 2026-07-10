import * as React from 'react';
import { BtnArrow } from './BtnArrow';

/**
 * Wspólny blok CTA na dole strony (ciemna sekcja): eyebrow + h2 + tekst +
 * przycisk akcentowy z podwójną strzałką + ghost (domyślnie telefon).
 */
export interface CtaBandProps {
  eyebrow?: string;
  heading: string;
  text?: string;
  btnLabel?: string;
  btnHref?: string;
  ghostLabel?: string;
  ghostHref?: string;
  ghostExternal?: boolean;
  padTop?: boolean;
  id?: string | null;
}

export function CtaBand({
  eyebrow = 'Wdrożenie u Was',
  heading,
  text = 'Akademia to materiały. Wdrożenie to dwa kwartały na Waszym kodzie — z pomiarem efektu w DEVLens. 30 minut wystarczy, żeby sprawdzić, czy ma to u Was sens.',
  btnLabel = 'Umów rozmowę',
  btnHref = '/umow-rozmowe',
  ghostLabel = '+48 505 091 200',
  ghostHref = 'tel:+48505091200',
  ghostExternal = false,
  padTop = true,
  id = 'cta',
}: CtaBandProps) {
  return (
    <section className="sect sect--dark cta-band" aria-labelledby={id ?? undefined} style={padTop ? undefined : { paddingTop: 0 }}>
      <div className="container">
        <p className="eyebrow rv" data-scramble="">{eyebrow}</p>
        <h2 className="ws" id={id ?? undefined} style={{ marginTop: 'var(--space-lg)' }}>{heading}</h2>
        <p className="rv">{text}</p>
        <div className="contact__cta rv">
          <BtnArrow href={btnHref}>{btnLabel}</BtnArrow>
          <a className="btn btn--ghost" href={ghostHref} target={ghostExternal ? '_blank' : undefined} rel={ghostExternal ? 'noopener noreferrer' : undefined}>{ghostLabel}</a>
        </div>
      </div>
    </section>
  );
}
