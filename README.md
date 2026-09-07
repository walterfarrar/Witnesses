# Witnesses

A phone-first lab for one of the simplest arguments in New Testament textual criticism:

1. Write an original sentence (the “autograph”).
2. Scribes copy it, then copy those copies, generation after generation.
3. Each copy introduces tiny, independent mistakes.
4. Every generation is **dated**, so you know about how old each witness is.
5. The first one or two generations are **hidden** — just as the original New Testament pages are gone.
6. From the later copies alone, try to piece the sentence back together.

Most of the time the original is still recoverable, because the scribes do not all make the same mistake, and the earlier surviving copies sit closer to the source.

## Use it on your phone

Open **[walterfarrar.github.io/Witnesses](https://walterfarrar.github.io/Witnesses/)**, or add it to your Home Screen from the browser share menu. It is a Progressive Web App and works offline after the first load.

If you are running it locally:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

## What the simulation is doing

- **Careful / typical / sloppy scribes** change how often a copyist slips.
- Errors are small: a confused letter, a dropped character, a swapped pair of words, an omitted “and.”
- Copies branch. Some lines die out. Later centuries have more manuscripts.
- Hidden generations never appear in the surviving list, but their descendants do — often labeled “copied from a lost P…” so the family is still visible.
- The **dated majority** reconstruction weights earlier copies more heavily, the same instinct textual critics use when an older papyrus and a crowd of medieval minuscules disagree.

This is a teaching toy, not a critical edition of any biblical book. The real New Testament tradition is much larger: thousands of Greek manuscripts, early versions, and quotations, with fragments from the second century.

## Tests

```bash
node --test test/engine.test.mjs
```

## Deploy

The site is static files at the repository root. GitHub Pages publishes from `main` to https://walterfarrar.github.io/Witnesses/. Netlify can publish the same folder with the included `netlify.toml`.
