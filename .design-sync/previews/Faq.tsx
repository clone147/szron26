import * as React from 'react';
import { Faq } from 'szron-ds';

const ITEMS = [
  {
    q: 'Ile trwa wdrożenie programowania agentowego w zespole?',
    a: 'Standardowo dwa kwartały: pierwszy na fundamenty i narzędzia, drugi na pracę na Waszym kodzie produkcyjnym z pomiarem efektu w DEVLens.',
  },
  {
    q: 'Czy pracujecie tylko w Rzeszowie?',
    a: 'Działamy w całej Polsce — spotkania online (Teams / Meet) lub na miejscu u klienta. Rzeszów to tylko siedziba.',
  },
  {
    q: 'Jak mierzycie efekt szkolenia?',
    a: 'Przed startem i po wdrożeniu mierzymy metryki zespołu w <strong>DEVLens</strong> — czas cyklu, przepustowość i jakość. Raport dostaje zarząd, nie tylko zespół.',
  },
];

export const Default = () => (
  <div className="sect"><div className="container">
    <Faq items={ITEMS} />
  </div></div>
);

export const SingleItem = () => (
  <div className="sect"><div className="container">
    <Faq items={[ITEMS[0]]} />
  </div></div>
);
