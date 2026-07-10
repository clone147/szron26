import * as React from 'react';
import { BtnArrow } from 'szron-ds';

export const Accent = () => <BtnArrow href="/umow-rozmowe">Umów rozmowę</BtnArrow>;

export const Ghost = () => (
  <div className="sect sect--dark" style={{ padding: '2rem' }}>
    <BtnArrow href="tel:+48505091200" className="btn btn--ghost">+48 505 091 200</BtnArrow>
  </div>
);

export const Neutral = () => <BtnArrow href="/case-studies" className="btn">Zobacz case studies</BtnArrow>;

export const AsButton = () => <BtnArrow type="submit">Wyślij zgłoszenie</BtnArrow>;

export const OnDark = () => (
  <div className="sect sect--dark" style={{ padding: '2rem' }}>
    <BtnArrow href="/umow-rozmowe">Umów diagnozę</BtnArrow>{' '}
    <BtnArrow href="/metoda" className="btn btn--ghost">Poznaj metodę</BtnArrow>
  </div>
);
