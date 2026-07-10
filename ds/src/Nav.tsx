import * as React from 'react';

/**
 * Główna nawigacja (wariant statyczny): logo + linki + CTA „Umów diagnozę".
 * Dropdowny Oferta/Akademia i logowanie Strefy to skrypty runtime strony —
 * tu linki płaskie. logoSrc: podaj własne źródło (na stronie: /img/logo-dark.svg).
 */
export interface NavLink { label: string; href: string }
export interface NavProps {
  links?: NavLink[];
  ctaLabel?: string;
  ctaHref?: string;
  logoSrc?: string;
  logoAlt?: string;
}

const DEFAULT_LINKS: NavLink[] = [
  { label: 'Metoda', href: '/metoda' },
  { label: 'Akademia', href: '/akademia' },
  { label: 'Case studies', href: '/case-studies' },
  { label: 'Open source', href: '/open-source' },
  { label: 'Zespół', href: '/o-nas' },
  { label: 'Kontakt', href: '/kontakt' },
];

const Arr = () => (
  <span className="btn__arr" aria-hidden="true">
    <svg viewBox="0 0 16 16" fill="none"><path d="M2 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.8" /></svg>
    <svg viewBox="0 0 16 16" fill="none"><path d="M2 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.8" /></svg>
  </span>
);

export function Nav({
  links = DEFAULT_LINKS,
  ctaLabel = 'Umów diagnozę',
  ctaHref = '/umow-rozmowe',
  logoSrc = '/img/logo-dark.svg',
  logoAlt = 'SZRON — strona główna',
}: NavProps) {
  return (
    <header className="nav" id="nav">
      <div className="container nav__inner">
        <a className="logo" href="/" aria-label={logoAlt}>
          <img src={logoSrc} alt="" width={105} height={26} />
        </a>
        <nav aria-label="Nawigacja główna">
          <ul className="nav__links">
            {links.map((l) => (
              <li key={l.href}><a href={l.href}>{l.label}</a></li>
            ))}
          </ul>
        </nav>
        <a className="btn btn--accent" href={ctaHref}>{ctaLabel}<Arr /></a>
        <button className="nav__burger" aria-expanded="false" aria-controls="nav-menu" aria-label="Otwórz menu">
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>
  );
}
