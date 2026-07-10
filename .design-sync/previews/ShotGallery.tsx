import * as React from 'react';
import { ShotGallery } from 'szron-ds';

const shot = (label: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'><rect width='640' height='400' fill='#f6f6f7'/><rect x='24' y='24' width='592' height='56' rx='8' fill='#33383f'/><rect x='24' y='104' width='380' height='16' rx='4' fill='#e2e3e5'/><rect x='24' y='132' width='300' height='16' rx='4' fill='#e2e3e5'/><rect x='24' y='176' width='592' height='200' rx='8' fill='#ececee'/><text x='320' y='285' text-anchor='middle' font-family='monospace' font-size='20' fill='#6b7078'>${label}</text></svg>`
  );

export const ThreeColumns = () => (
  <div className="sect"><div className="container">
    <ShotGallery
      items={[
        { src: shot('DEVLens — dashboard'), alt: 'Dashboard DEVLens', caption: 'DEVLens: metryki zespołu przed i po wdrożeniu' },
        { src: shot('Strefa — szkolenia'), alt: 'Panel szkoleń', caption: 'Strefa zamknięta: postęp szkoleń zespołu' },
        { src: shot('Panel HTTP — STM32'), alt: 'Panel konfiguracyjny STM32', caption: 'Open source: panel konfiguracyjny STM32' },
      ]}
    />
  </div></div>
);

export const TwoColumns = () => (
  <div className="sect"><div className="container">
    <ShotGallery
      cols={2}
      items={[
        { src: shot('Kalkulator ROI AI'), alt: 'Kalkulator ROI', caption: 'Kalkulator ROI wdrożenia AI' },
        { src: shot('Akademia — slajdy'), alt: 'Edytor slajdów', caption: 'Edytor slajdów szkoleniowych' },
      ]}
    />
  </div></div>
);
