# Grafiki hero dla podstron — lista + prompty (GPT-5.4 Image 2)

Każda podstrona dostaje jedną grafikę „bohatera" w pasie nagłówka (obok H1).
Spójny system wizualny „szron + żar": grafit `#080d10`, motyw szronu/kryształów lodu,
jeden ciepły pomarańczowy akcent `#ff7a00`, premium tech-editorial.

- Model: `gpt54` (GPT-5.4 Image 2 przez OpenRouter), `--aspect 16:9`, `--resolution 2K`.
- Zapis docelowy: `public/img/sub/<plik>.webp` (1600×900).
- Wspólny sufiks promptu (dołączany automatycznie): *deep charcoal background #080d10, single
  warm orange ember accent #ff7a00, hoarfrost and ice-crystal texture, premium tech-editorial
  cinematic photography, volumetric light, shallow depth of field, generous dark negative space,
  no text, no logos, no people, no faces.*

| Plik | Strona | Koncept |
|---|---|---|
| metoda | /metoda | trzy strumienie światła w oszronionym kanale zbiegające się w jeden punkt |
| doradztwo | /doradztwo-technologiczne | świetlista ścieżka obwodów wijąca się przez pole szronu (roadmapa z lotu ptaka) |
| wdrozenia-ai | /wdrozenia-ai | zazębiające się oszronione koła zębate z pomarańczową energią w stykach |
| transformacja-ai | /transformacja-ai | pęknięty szary lód przechodzący w uporządkowaną świecącą kratę kryształów |
| transformacja-ai-dla-programistow | /transformacja-ai-dla-programistow | makro oszronionej mechanicznej klawiatury, pomarańczowe światło spod klawiszy |
| augmentacja-pracownikow | /augmentacja-pracownikow | abstrakcyjna sylwetka z nici pomarańczowego światła na rdzeniu z kryształów |
| ai-dla-dev-teamow | /ai-dla-dev-teamow | konstelacja oszronionych węzłów połączonych pomarańczowymi liniami (sieć) |
| ai-dla-embedded | /ai-dla-embedded | makro oszronionego mikrokontrolera/PCB, pomarańczowe ścieżki pod lodem |
| ai-dla-przemyslu | /ai-dla-przemyslu | ciemna hala przemysłowa, szron na stali, świecący pomarańczowo panel sterowania |
| ai-sektor-regulowany | /ai-sektor-regulowany | krystaliczny sejf/tarcza z lodu osłaniający świecący pomarańczowy rdzeń danych |
| ai-pilot-procesu | /ai-pilot-procesu | jeden świecący pomarańczowo moduł wśród wielu ciemnych zamrożonych bloków |
| mobile-apps | /mobile-apps | oszroniony smartfon pod kątem, pomarańczowe światło UI spod krawędzi ekranu |
| devlens | /devlens | dashboard wykresów wyrzeźbiony z lodu, pomarańczowe linie danych |
| open-source | /open-source | krzyształy szronu splecione w otwartą kratę, pomarańczowe światło w spoinach |
| dla-zespolow | /dla-zespolow | zwarta grupa oszronionych form ze wspólnym pomarańczowym rdzeniem (zespół) |
| outsourcing-vs-inhouse-ai | /outsourcing-vs-inhouse-ai | dwa bloki lodu na zamrożonej wadze, jeden świeci pomarańczowo |
| ai-act-compliance | /ai-act-compliance | oszroniony dokument/pieczęć z lodu z pomarańczowym znakiem w centrum |
| webinar-ai-dla-ceo | /webinar-ai-dla-ceo | ciemny oszroniony ekran audytorium świecący pomarańczowo, rzędy zamrożonych foteli |
| o-nas | /o-nas | dwa wysokie oszronione filary-kryształy obok siebie, każdy z pomarańczowym rdzeniem |
| akademia | /akademia | otwarta księga z lodu, strony zmieniające się w kryształy i pomarańczowe drobiny wiedzy |
| case-studies | /case-studies | trzy oszronione monolity różnej wysokości, każdy świeci pomarańczowo inną mocą |
| cs-stm32 | /case-studies/stm32 | makro oszronionej płytki STM32, lód na goldpinach, świecące pomarańczowe ścieżki |
| cs-hmi | /case-studies/hmi | oszroniony przemysłowy panel HMI na stali, pomarańczowe światło interfejsu pod lodem |
| cs-regiobus | /case-studies/regiobus | miejski autobus nocą za oszronioną szybą, pomarańczowe światło wnętrza i walidatora NFC |

Prompty pełne (EN) trzymane są w skrypcie generującym `/tmp/gen-sub.py`.
