import * as React from 'react';

/**
 * Stopka SZRON: 4 kolumny (logo+tagline, zespół, kontakt+adres, mapa strony),
 * pasek legal i gigantyczny wordmark „SZRON" na dole (--text-mark).
 */
export interface FooterCol { heading: string; items: React.ReactNode[] }
export interface FooterProps {
  logoSrc?: string;
  tagline?: string;
  cols?: FooterCol[];
  legal?: string;
  mark?: string;
}

const DEFAULT_COLS: FooterCol[] = [
  { heading: 'Zespół', items: ['Tomek Wojciechowski — założyciel, AI workflow', 'Maciej Stopa — backend & mobile lead'] },
  { heading: 'Kontakt', items: [<a key="m" href="mailto:tw@szron.tech">tw@szron.tech</a>, <a key="t" href="tel:+48505091200">+48 505 091 200</a>] },
  { heading: 'Strona', items: [<a key="1" href="/metoda">Metoda</a>, <a key="2" href="/case-studies">Case studies</a>, <a key="3" href="/akademia">Akademia</a>, <a key="4" href="/kontakt">Kontakt</a>] },
];

export function Footer({
  logoSrc = '/img/logo.svg',
  tagline = 'Transformacja zespołów IT i programowanie agentowe dla dużych firm.',
  cols = DEFAULT_COLS,
  legal = '© 2026 SZRON Tomek Wojciechowski.',
  mark = 'SZRON',
}: FooterProps) {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__col">
            <a className="logo logo--footer" href="/" aria-label="SZRON — strona główna" style={{ marginBottom: 'var(--space-lg)' }}>
              <img src={logoSrc} alt="" width={122} height={30} />
            </a>
            <p className="footer__tagline">{tagline}</p>
          </div>
          {cols.map((c) => (
            <div className="footer__col" key={c.heading}>
              <h2>{c.heading}</h2>
              <ul role="list">
                {c.items.map((it, i) => <li key={i}>{it}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="footer__legal">
          <p>{legal}</p>
          <nav aria-label="Linki prawne">
            <a href="/privacy-policy">Polityka prywatności</a>
            <a href="/terms-of-service">Warunki korzystania</a>
          </nav>
        </div>
      </div>
      <p className="footer__mark" aria-hidden="true">{mark}</p>
    </footer>
  );
}
