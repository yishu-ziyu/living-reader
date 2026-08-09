# Reader Surface Lab — THROWAWAY PROTOTYPE

This is a small, local comparison of the same reading anchors rendered as a real PDF surface or selectable semantic HTML. It is intentionally modern and content-neutral; it is not a production reader, an EventStore, or an LLM integration.

## Run

From the repository root:

```bash
python3 -m http.server 4178
```

Open either variant:

- <http://127.0.0.1:4178/prototypes/html-reader-comparison/?variant=html>
- <http://127.0.0.1:4178/prototypes/html-reader-comparison/?variant=pdf>

The bottom switcher and left/right arrow keys change variants without leaving the experiment.

## Source and evidence

The HTML fixture uses the OLL Cannan vol. 1 EPUB wording and source locators:

- `oll.smith_0206-01_235` / `Smith_0206-01_235` — division of labour, PDF 36 / print p. 19.
- `oll.smith_0206-01_251` / `Smith_0206-01_251` — market extent, PDF 45 / print p. 20.

Official OLL title and download page: <https://oll.libertyfund.org/titles/smith-an-inquiry-into-the-nature-and-causes-of-the-wealth-of-nations-cannan-ed-vol-1>. The evidence drawer opens the repository's real local PDF at the matching page and labels it as page-level verification; it does not claim synchronized text highlighting.

## What is testable by hand

- Replay either source, or use browser `SpeechRecognition` when available. The speech-start snapshot keeps the Idea bound to the source selected when recording began, even if the reader scrolls.
- Add both Ideas, confirm the typed relation, and watch the fixed-height world slot move `closed → loading → open`. Loading reserves the final stage height; event text scrolls inside the stage.
- In the small market, the weaver refuses another specialization step without changing metrics. “Expand market” appends deterministic observations in `merchant → shepherd → spinner → weaver` order.
- Collapse returns to the source that triggered the stage. Open the footnote marker and the PDF evidence drawer to inspect the reading affordances.

`window.__htmlReaderComparison` is a prototype-only test surface exposing state and deterministic actions. It is not a production authorization boundary.

## Verification notes

The static files pass `node --check app.js`. Real microphone permission and browser-specific SpeechRecognition behavior remain hardware/browser-dependent; Replay is provided for a deterministic demo path.
