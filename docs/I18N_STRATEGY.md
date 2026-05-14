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
      "viz_translation": "Gum-Gum Fruit",
      "fr_glenat": "Fruit du Gum Gum"
    }
  }
}
```

The `default` is what's shown unless the user picks a variant. Variants
are documented in
`/data/schemas/vocabulary/translation-variants.json`.

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
