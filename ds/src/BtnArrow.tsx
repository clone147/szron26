import * as React from 'react';

/**
 * Przycisk z podwójną strzałką — animacja hover w main.css wymaga dokładnie
 * 2 SVG wewnątrz .btn__arr. Z `href` renderuje <a>, bez — <button>.
 * Warianty przez className: "btn btn--accent" (domyślny), "btn btn--ghost", "btn".
 */
export interface BtnArrowProps extends React.HTMLAttributes<HTMLElement> {
  href?: string;
  className?: string;
  children?: React.ReactNode;
}

const Arr = () => (
  <span className="btn__arr" aria-hidden="true">
    <svg viewBox="0 0 16 16" fill="none"><path d="M2 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.8" /></svg>
    <svg viewBox="0 0 16 16" fill="none"><path d="M2 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.8" /></svg>
  </span>
);

export function BtnArrow({ href, className = 'btn btn--accent', children, ...rest }: BtnArrowProps) {
  if (href) {
    return (
      <a className={className} href={href} {...rest}>{children}{'\n'}<Arr /></a>
    );
  }
  return (
    <button className={className} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>{children}{'\n'}<Arr /></button>
  );
}
