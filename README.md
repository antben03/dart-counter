# 🎯 Svinstads Stora Dartturnering

En webbapp för att hålla i dartturneringar med kompisgänget – gruppspel, slutspel,
poängräknare och statistik. Allt körs i webbläsaren, helt utan server eller installation.

**Live:** https://antben03.github.io/svinstads-dartturnering/

## Funktioner

- **Valfritt antal spelare (3–16).** Appen lottar lämpligt gruppspel automatiskt:
  3–5 spelare ger en grupp, 6+ ger två grupper. Ojämna grupper hanteras genom att
  den mindre gruppen spelar en match mindre.
- **Slutspel** med semifinaler, valfri bronsmatch och final.
- **Spelformat per fas.** 501 eller 301, single out / double out / double out med max 5
  försök, samt antal set och legs – ställs in separat för gruppspel, semifinal,
  bronsmatch och final, och kan dessutom justeras inför varje enskild match.
- **Poängräknare** med inmatning per pil, automatiska checkout-förslag, bust-hantering
  och ångra-knapp.
- **Tiebreak** med sudden death-leg när tabellen står lika.
- **Statistik** över hela turneringen: 3-pilssnitt, högsta serie, antal 180/140+/100+
  och bästa checkout.
- **Chase the Sun** (valfritt) – spelas via YouTube efter varje vunnet leg.
- **Export/import** av turneringen som JSON för att kunna pausa eller byta enhet.

## Köra lokalt

Det behövs inget bygge och inga beroenden. Öppna bara `index.html` i en webbläsare,
eller starta en enkel lokal server:

```bash
python3 -m http.server 8000
# öppna sedan http://localhost:8000
```

## Teknik

Ren HTML, CSS och JavaScript (vanilla, inga ramverk). Strukturen är:

```
.
├── index.html        # Sidans stomme
├── css/style.css     # All styling
├── js/app.js         # All logik (turnering, räknare, statistik)
├── favicon.svg
└── README.md
```

## Datalagring

All turneringsdata lever i minnet under sessionen. Laddas sidan om försvinner den –
använd **Exportera JSON** i turneringsvyn för att spara, och **Importera JSON** för
att fortsätta senare.

## Licens

MIT – se [LICENSE](LICENSE).
