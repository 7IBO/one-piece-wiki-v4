# i18n Strategy

The wiki must serve content in multiple languages, with attention paid to
which strings come from which source. This document defines the
translation architecture.

## Three categories of strings

Strings in the system fall into three categories, each with its own
storage and editing workflow.

### 1. UI chrome (application strings)

Buttons, menu labels, error messages, form helpers. They belong to the
application, not to the data.

- **Storage**: `apps/<app>/locales/<locale>.json` per app, plus
  `packages/i18n/strings/<locale>.json` for shared strings
- **Loader**: `@onepiece-wiki/i18n` resolves keys at runtime
- **Editing**: by developers, via PRs

### 2. Vocabulary and schema labels

Labels for entity types, property types, relation types, and vocabulary
values.

- **Storage**: inline in schema files (`labels: { en: ..., fr: ... }`)
- **Loader**: read once at startup; cached
- **Editing**: by admins via schema PRs (phase 1) or via the dashboard's
  vocabulary editor (phase 5)

### 3. Content (entity-specific data)

Names, descriptions, narratives — everything that varies per entity per
locale.

- **Storage**: parallel tree under `/data/universes/<u>/translations/`
  and `/data/universes/<u>/narratives/`
- **Loader**: part of the build pipeline; bundled into the SQLite or
  fetched on demand
- **Editing**: by contributors via the dashboard

## Localization terminology

Three related but distinct names appear across the data model and
schemas. The full specification lives in `/docs/SCHEMA_SPEC.md` under
"Localization terminology"; this section is the editor-facing summary.

- **`i18n_key`** — the **`value_type`** on a property type that marks
  the property's values as localizable. Property types with this
  `value_type` store i18n keys, not literal strings.

- **`value_key`** — the **field** inside a historisable property entry
  that holds the i18n key, replacing the bare `value` when the property
  is localizable.

- **`canonical_name_key`** — a **top-level field on the entity** holding
  the i18n key for its canonical display name. Distinct from the
  historisable `name` property: `canonical_name_key` is what listings,
  breadcrumbs, and search results render.

The token `name_key` is **not part of the model**; treat any occurrence
as a doc bug.

## Content storage layout

```
/data/universes/one-piece/
├── entities/
│   └── character/
│       └── luffy.json              # locale-neutral structure
├── translations/
│   ├── en/
│   │   └── character/
│   │       └── luffy.json          # values for i18n_keys in en
│   └── fr/
│       └── character/
│           └── luffy.json          # values for i18n_keys in fr
└── narratives/
    ├── en/
    │   ├── character/
    │   │   └── luffy.md            # overview narrative
    │   └── event/
    │       └── battle-of-marineford.md
    └── fr/
        └── ...
```

## Translation file shape

Translation files are flat key-value maps:

```json
{
  "character.luffy.name.short": "Luffy",
  "character.luffy.name.full": "Monkey D. Luffy",
  "character.luffy.epithet.straw-hat": "Straw Hat",
  "character.luffy.epithet.fifth-emperor": "Fifth Emperor"
}
```

FR equivalent:

```json
{
  "character.luffy.name.short": "Luffy",
  "character.luffy.name.full": "Monkey D. Luffy",
  "character.luffy.epithet.straw-hat": "Chapeau de Paille",
  "character.luffy.epithet.fifth-emperor": "Cinquième Empereur"
}
```

## Variants within a locale

Some content has multiple acceptable variants in the same locale (e.g. an
official manga translation versus an anime dub). The shape supports
variants:

```json
{
  "devil-fruit.gomu-gomu.name.common": {
    "default": "Gomu Gomu no Mi",
    "variants": {
      "viz": "Gum-Gum Fruit",
      "glenat": "Fruit du Gum Gum"
    }
  }
}
```

The `default` is what's shown unless the user picks a variant. Variant keys
are the ids in `/data/schemas/vocabulary/translation-variants.json` (`viz`,
`glenat`, `kana`, `funimation`, `4kids`, `official_dub_en`, `official_dub_fr`,
`fan_translation`). **Resolution precedence** (ADR-038): the reader's chosen
edition variant → the key's `default` → the `en` fallback.

### Naming axes (ADR-038)

A name entry's `name_type` distinguishes not only common/true/alias/… but
three **script/meaning axes**:

- `native_script` — the original Japanese (kanji/kana), e.g. `ゴムゴムの実`.
- `romanized` — the Hepburn romanization, e.g. `Gomu Gomu no Mi`.
- `literal_meaning` — an English/French gloss, e.g. "Gum-Gum".

`native_script` and `romanized` are **locale-neutral content**: the same
string resolves under every UI locale (store it once; `en`, `fr` share it)
until a real `ja` locale is added (see "Adding a new locale"). Only
`literal_meaning` and the everyday names genuinely differ per locale and per
edition (via the `{default, variants}` shape above).

## Naming i18n keys

A consistent convention helps editors and Claude alike:

- Pattern: `<entity-type>.<entity-slug>.<property>.<variant>`
- Examples:
  - `character.luffy.name.short`
  - `character.luffy.epithet.straw-hat`
  - `devil-fruit.gomu-gomu.name.common`
  - `devil-fruit.gomu-gomu.name.true`
  - `event.battle-of-marineford.summary`

For UI chrome:

- Pattern: `<feature>.<action>.<element>`
- Examples:
  - `dashboard.entity.save_button`
  - `form.error.required`
  - `nav.menu.characters`

## Narratives

Narratives are Markdown files, one per (locale, scope). They can contain:

- Light Markdown (headings, bold, italic, links)
- Typed entity links: `[[character:zoro]]` rendered as a hyperlink
  with the entity's localized name
- Spoiler markers: `:::spoiler chapter:1044{Some text}:::`
  hidden if the user hasn't reached chapter 1044

Example:

```markdown
After breaking out of Impel Down with a group of dangerous prisoners,
[[character:luffy]] arrived at Marineford to rescue his brother
[[character:ace]] from execution. Despite the overwhelming forces of
the Marines and the [[crew:whitebeard-pirates]]' efforts, Ace was
killed by [[character:akainu]] while protecting Luffy.
```

At build time, narratives are parsed and:

- Linked entities are extracted; the page knows what it references
- Spoiler markers are converted to a structure the read app can filter
- The result is stored as both raw markdown (for re-editing) and parsed
  HTML (for serving)

## Spoiler handling on narratives

When a narrative mentions an entity or fact the user hasn't reached:

- If the mention is `[[entity:foo]]` and the user hasn't reached
  the entity's first appearance, the rendered text replaces the link
  with "???" (or with the spoiler placeholder UI)
- If the mention is inside a `:::spoiler:::` block, the whole block is
  hidden

This is one reason entity links are typed: the build pipeline can
analyze cross-references statically.

## Build-time bundling

For performance, all translations for a given locale are bundled into
`/dist/translations/<locale>.json` at build time. The app loads only the
active locale's bundle.

For SSG/SSR routes, the relevant translation values are inlined into the
page HTML; client-side navigation falls back to the bundle.

## Missing translations

Policy:

- The default locale (`en`) is **required** for every key. If an entity
  is missing an English value, the build fails.
- Other locales **fall back to default** with a visible "(en)" badge in
  the UI, so editors can find untranslated content.
- A `bun run translations:report` command lists coverage per locale per
  entity type.

## Adding a new locale (phase 6+)

Adding e.g. Japanese means:

1. Add `ja` to the locale enum in `packages/i18n`
2. Create `translations/ja/` and `narratives/ja/` trees
3. Add `ja` to schema label objects (entity types, property types, etc.)
4. UI chrome strings get a new `ja.json` per app

The data model never needs to change to support a new locale.

## Locale-specific formatting

Numbers (especially bounties), dates, and units follow locale conventions:

- Use `Intl.NumberFormat` and `Intl.DateTimeFormat`
- Configured per locale in `packages/i18n/format.ts`

## Editing translations from the dashboard

Phase 4+: when editing an entity, the form shows a tab per locale for
each `localizable` property. Saving writes both the entity (structural
change) and the translation files (content change). All as a single PR.

Phase 1: translations are seeded by hand from a small fixture set.

## Comparison to inline i18n

Why not inline translations in the entity JSON?

- Diff readability: a French translator should not see English values
  in their PR diff
- Editor focus: a translator works on one locale at a time
- Validation: each locale can be validated independently
- Performance: skipping unused locales at build time is trivial

The added complexity is worth it.
