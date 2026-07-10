import * as React from 'react';
import { CtaBand } from 'szron-ds';

export const Default = () => <CtaBand heading="Sprawdźmy, czy to ma u Was sens" />;

export const CustomCopy = () => (
  <CtaBand
    eyebrow="Akademia SZRON"
    heading="Zacznij od szkolenia zespołu"
    text="Osiem szkoleń z programowania agentowego — od podstaw Claude Code po autonomiczne pipeline'y. Dostęp dla całego zespołu."
    btnLabel="Zobacz Akademię"
    btnHref="/akademia"
    ghostLabel="Porozmawiaj z nami"
    ghostHref="/kontakt"
  />
);
