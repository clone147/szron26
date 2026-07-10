import * as React from 'react';
import { SectHead } from 'szron-ds';

export const Default = () => (
  <div className="sect"><div className="container">
    <SectHead eyebrow="Metoda" title="Dwa kwartały na Waszym kodzie" />
  </div></div>
);

export const WithLead = () => (
  <div className="sect"><div className="container">
    <SectHead eyebrow="Case studies" title="Efekty, które da się zmierzyć">
      <p className="sect-lead rv">Każde wdrożenie kończy się pomiarem w DEVLens — liczby zamiast wrażeń.</p>
    </SectHead>
  </div></div>
);

export const Small = () => (
  <div className="sect"><div className="container">
    <SectHead small eyebrow="FAQ" title="Najczęstsze pytania o transformację AI w zespołach programistycznych" />
  </div></div>
);

export const OnDark = () => (
  <div className="sect sect--dark"><div className="container">
    <SectHead eyebrow="Wdrożenie u Was" title="Sprawdźmy, czy to ma u Was sens" />
  </div></div>
);
