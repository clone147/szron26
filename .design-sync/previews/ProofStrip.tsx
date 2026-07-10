import * as React from 'react';
import { ProofStrip } from 'szron-ds';

export const Default = () => (
  <ProofStrip
    items={[
      ['15+ lat', 'doświadczenia w software'],
      ['2 kwartały', 'na pełne wdrożenie'],
      ['100%', 'pracy na Waszym kodzie'],
      ['DEVLens', 'pomiar efektu wdrożenia'],
    ]}
  />
);

export const InsideSection = () => (
  <section className="sect"><div className="container">
    <ProofStrip
      wrap={false}
      items={[
        ['49', 'przeszkolonych programistów'],
        ['8', 'szkoleń w Akademii'],
        ['30 min', 'wystarczy na diagnozę'],
      ]}
    />
  </div></section>
);
