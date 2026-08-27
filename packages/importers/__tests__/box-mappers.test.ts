/**
 * The six "* Box" mappers added by ADR-109 (devil-fruit, crew, ship,
 * organization, weapon, arc).
 *
 * NB: every `fixtures/{devil-fruit,crew,ship,organization,weapon,arc}-*`
 * file is SYNTHETIC — the sandbox denies onepiece.fandom.com (ADR-079
 * §6), so they are modelled param-for-param on the field inventory of
 * `docs/audits/fandom-structure-2026-08-27.json`. They must be
 * validated against live `action=parse` responses on the first CI run.
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { GENERATED_DIR, REPO_ROOT } from '../../schema-engine/src/paths.ts';
import { buildEmitFiles } from '../src/emit.ts';
import { mapArc } from '../src/fandom/arc.ts';
import {
  type BoxMapContext,
  matchVocabulary,
  parseRuby,
  parseSourceRefs,
  slugify,
  splitSegments,
} from '../src/fandom/box.ts';
import type { ParsedPage } from '../src/fandom/client.ts';
import { detectKind } from '../src/fandom/crawl.ts';
import { mapCrew } from '../src/fandom/crew.ts';
import { mapDevilFruit, parseZoanModel } from '../src/fandom/devil-fruit.ts';
import { mapOrganization } from '../src/fandom/organization.ts';
import { buildTitleIndex } from '../src/fandom/registry.ts';
import { mapShip } from '../src/fandom/ship.ts';
import { indexVocabulary, loadVocabularyIndexes } from '../src/fandom/vocabulary.ts';
import { mapWeapon } from '../src/fandom/weapon.ts';

async function fixture(name: string): Promise<ParsedPage> {
  const raw = await Bun.file(
    join(import.meta.dir, 'fixtures', `${name}.json`),
  ).json() as { parse: { title: string; pageid: number; wikitext: string; }; };
  return {
    title: raw.parse.title,
    pageId: raw.parse.pageid,
    wikitext: raw.parse.wikitext,
    url: `https://onepiece.fandom.com/wiki/${raw.parse.title.replace(/ /g, '_')}`,
  };
}

const vocabularies = await loadVocabularyIndexes(REPO_ROOT);

/** A ledger covering the fixtures' wikilink targets, so relation
 *  resolution is exercised the way a real run resolves it. */
const titleIndex = buildTitleIndex({
  pages: [
    { entityId: 'character:lassoo', page: 'Lassoo', pageId: 1, redirects: [] },
    { entityId: 'crew:straw-hat-pirates', page: 'Straw Hat Pirates', pageId: 2, redirects: [] },
    {
      entityId: 'organization:world-government',
      page: 'World Government',
      pageId: 3,
      redirects: [],
    },
    { entityId: 'location:enies-lobby', page: 'Enies Lobby', pageId: 4, redirects: [] },
    { entityId: 'organization:marines', page: 'Marines', pageId: 5, redirects: [] },
    { entityId: 'character:kuro', page: 'Kuro', pageId: 6, redirects: [] },
  ],
});

const ctx: BoxMapContext = { titleIndex, vocabularies };

async function zod(name: string): Promise<{
  safeParse: (v: unknown) => { success: boolean; error?: { message: string; }; };
}> {
  const mod = (await import(join(GENERATED_DIR, 'entities.ts'))) as Record<string, unknown>;
  return mod[name] as {
    safeParse: (v: unknown) => { success: boolean; error?: { message: string; }; };
  };
}

describe('shared "* Box" helpers', () => {
  it('reads {{Ruby|base|reading}} as the written Japanese name', () => {
    expect(parseRuby('{{Ruby|秋水|しゅうすい}}')).toBe('秋水');
    expect(parseRuby('ワノ国編')).toBeNull();
  });

  it('parses `first` wikilink lists into source ids, manga first', () => {
    expect(parseSourceRefs('[[Chapter 24]]; [[Episode 8]]')).toEqual([
      'manga-chapter:24',
      'anime-episode:8',
    ]);
  });

  it('splits <br>, ";" and "----" separated sub-values', () => {
    expect(splitSegments('Paramecia<br>----<br>Mythical Zoan')).toEqual([
      'Paramecia',
      'Mythical Zoan',
    ]);
    expect(splitSegments('a; b')).toEqual(['a', 'b']);
  });

  it('caps slugs at the Slug maximum on a separator', () => {
    expect(slugify('Royal Drum Crown 7-Shot Tin Tyrant Cannon')).toBe(
      'royal-drum-crown-7-shot-tin-tyrant-cannon',
    );
    expect(slugify('a'.repeat(40) + ' ' + 'b'.repeat(40)).length).toBeLessThanOrEqual(60);
  });

  it('matches vocabularies exactly, then by word, then inside a word', () => {
    const index = indexVocabulary({
      id: 'weapon-types',
      values: { sword: { labels: { en: 'Sword' } }, gun: { labels: { en: 'Gun' } } },
    });
    expect(matchVocabulary(index, 'Sword')).toMatchObject({ value: 'sword', exact: true });
    expect(matchVocabulary(index, 'a big sword indeed')).toMatchObject({
      value: 'sword',
      exact: false,
    });
    expect(matchVocabulary(index, 'Single-edged greatsword')).toMatchObject({
      value: 'sword',
      exact: false,
    });
    expect(matchVocabulary(index, 'nothing here')).toBeNull();
  });

  it("indexes a label's parenthesised head and tail", () => {
    const index = indexVocabulary({
      id: 'weapon-grades',
      values: { o_wazamono: { labels: { en: 'Great Grade (Ō Wazamono)' } } },
    });
    expect(index.get('great grade')).toBe('o_wazamono');
    expect(index.get('ō wazamono')).toBe('o_wazamono');
  });
});

describe('Devil Fruit Box → devil-fruit', () => {
  it('maps name locales, classification, zoan model and the held-by edge', async () => {
    const result = mapDevilFruit(await fixture('devil-fruit-inu-inu-dachshund'), ctx);
    expect(result).not.toBeNull();
    expect(result?.entity.id).toBe('devil-fruit:inu-inu-no-mi-model-dachshund');
    expect(result?.entity.properties['classification']).toEqual([
      { value: 'zoan', since: 'manga-chapter:24' },
    ]);
    expect(result?.entity.properties['zoan_model']).toEqual([
      { value: 'Dachshund', since: 'manga-chapter:24' },
    ]);
    expect(result?.entity.relations).toEqual([
      { type: 'held-by', target: 'character:lassoo', qualifiers: { since: 'manga-chapter:24' } },
    ]);
    const key = 'devil-fruit.inu-inu-no-mi-model-dachshund.name.common';
    expect(result?.translations.en[key]).toBe('Inu Inu no Mi, Model: Dachshund');
    expect(result?.translations.ja?.[key]).toBe('イヌイヌの実 モデル「ダックスフント」');
    expect(result?.translations['ja-latn']?.[key]).toBe('Inu Inu no Mi, Moderu: Dakkusufunto');
  });

  it('stores `meaning` as a literal_meaning name, never as prose', async () => {
    const result = mapDevilFruit(await fixture('devil-fruit-inu-inu-dachshund'), ctx);
    const names = result?.entity.properties['name'] as readonly Record<string, unknown>[];
    expect(names.map((n) => n['name_type'])).toEqual(['common', 'literal_meaning']);
    expect(
      result?.translations.en['devil-fruit.inu-inu-no-mi-model-dachshund.name.literal-meaning'],
    ).toBe('Dog');
  });

  it('routes the debut to a features edge on the source, not to a property', async () => {
    const result = mapDevilFruit(await fixture('devil-fruit-inu-inu-dachshund'), ctx);
    expect(Object.keys(result!.entity.properties).sort()).toEqual([
      'classification',
      'name',
      'zoan_model',
    ]);
    expect(result?.warnings.some((w) => w.includes('features →'))).toBe(true);
    expect(result?.warnings.some((w) => w.startsWith('ename dub variants'))).toBe(true);
  });

  it('parses the Zoan model out of the English name', () => {
    expect(parseZoanModel('Inu Inu no Mi, Model: Dachshund')).toBe('Dachshund');
    expect(parseZoanModel('Gomu Gomu no Mi')).toBeNull();
  });

  it("falls back to the vocabulary's unknown classification, never a guess", async () => {
    const page = await fixture('devil-fruit-inu-inu-dachshund');
    const result = mapDevilFruit({ ...page, wikitext: '{{Devil Fruit Box|type=Wobbly}}' }, ctx);
    expect(result?.entity.properties['classification']).toEqual([{ value: 'unknown' }]);
    expect(result?.warnings.some((w) => w.includes('unmapped classification'))).toBe(true);
  });

  it('passes the generated Zod gate and is routed by detectKind', async () => {
    const page = await fixture('devil-fruit-inu-inu-dachshund');
    expect(detectKind(page.wikitext)).toEqual({ kind: 'devil-fruit' });
    const parsed = (await zod('DevilFruitData')).safeParse(mapDevilFruit(page, ctx)?.entity);
    expect(parsed.success ? 'ok' : parsed.error?.message).toBe('ok');
  });
});

describe('Crew Box → crew', () => {
  it('maps the name locales and reports every edge that lives elsewhere', async () => {
    const page = await fixture('crew-black-cat-pirates');
    const result = mapCrew(page, ctx);
    expect(result?.entity.id).toBe('crew:black-cat-pirates');
    expect(result?.entity.relations).toEqual([]);
    expect(result?.entity.properties['name']).toEqual([
      {
        value_key: 'crew.black-cat-pirates.name.common',
        name_type: 'common',
        since: 'manga-chapter:25',
      },
    ]);
    expect(result?.translations.ja?.['crew.black-cat-pirates.name.common']).toBe('黒猫海賊団');
    for (const param of ['captain', 'ship', 'bounty']) {
      expect(result?.warnings.some((w) => w.startsWith(`${param}:`))).toBe(true);
    }
    expect(detectKind(page.wikitext)).toEqual({ kind: 'crew' });
    const parsed = (await zod('CrewData')).safeParse(result?.entity);
    expect(parsed.success ? 'ok' : parsed.error?.message).toBe('ok');
  });
});

describe('Ship Box → ship', () => {
  it('emits crewed-by, flags the missing vessel class, reports dimensions', async () => {
    const page = await fixture('ship-going-merry');
    const result = mapShip(page, ctx);
    expect(result?.entity.id).toBe('ship:going-merry');
    expect(result?.entity.properties['ship_type']).toEqual({ value: 'unknown' });
    expect(result?.entity.relations).toEqual([
      {
        type: 'crewed-by',
        target: 'crew:straw-hat-pirates',
        qualifiers: { since: 'manga-chapter:42' },
      },
    ]);
    expect(result?.warnings.some((w) => w.includes('ship_type defaulted to unknown'))).toBe(true);
    expect(result?.warnings.some((w) => w.startsWith('height:'))).toBe(true);
    expect(result?.warnings.some((w) => w.startsWith('length:'))).toBe(true);
    expect(result?.translations.ja?.['ship.going-merry.name.common']).toBe('ゴーイングメリー号');
    expect(detectKind(page.wikitext)).toEqual({ kind: 'ship' });
    const parsed = (await zod('ShipData')).safeParse(result?.entity);
    expect(parsed.success ? 'ok' : parsed.error?.message).toBe('ok');
  });
});

describe('Organization Box → organization', () => {
  it('emits subordinate-to / based-in / ally-of and reports leadership', async () => {
    const page = await fixture('organization-cp9');
    const result = mapOrganization(page, ctx);
    expect(result?.entity.id).toBe('organization:cp9');
    expect(result?.entity.relations).toEqual([
      {
        type: 'subordinate-to',
        target: 'organization:world-government',
        qualifiers: { since: 'manga-chapter:344' },
      },
      {
        type: 'based-in',
        target: 'location:enies-lobby',
        qualifiers: { since: 'manga-chapter:344' },
      },
      {
        type: 'ally-of',
        target: 'organization:marines',
        qualifiers: { since: 'manga-chapter:344' },
      },
    ]);
    expect(result?.warnings.some((w) => w.startsWith('leader:'))).toBe(true);
    expect(result?.warnings.some((w) => w.startsWith('status:'))).toBe(true);
    expect(result?.warnings.some((w) => w.startsWith('transportation:'))).toBe(true);
    expect(detectKind(page.wikitext)).toEqual({ kind: 'organization' });
    const parsed = (await zod('OrganizationData')).safeParse(result?.entity);
    expect(parsed.success ? 'ok' : parsed.error?.message).toBe('ok');
  });

  it('defaults organization_type to unknown when the prose carries no type', async () => {
    const result = mapOrganization(await fixture('organization-cp9'), ctx);
    expect(result?.entity.properties['organization_type']).toEqual({ value: 'unknown' });
    expect(result?.warnings.some((w) => w.includes('organization_type not inferable'))).toBe(true);
  });
});

describe('Weapon Box → weapon', () => {
  it('resolves weapon_type/grade from prose and lifts the black-blade flag', async () => {
    const page = await fixture('weapon-shusui');
    const result = mapWeapon(page, ctx);
    expect(result?.entity.id).toBe('weapon:shusui');
    expect(result?.entity.properties['weapon_type']).toEqual({ value: 'sword' });
    expect(result?.entity.properties['weapon_grade']).toEqual({ value: 'o_wazamono' });
    expect(result?.entity.properties['is_black_blade']).toEqual([
      { value: true, since: 'manga-chapter:449' },
    ]);
    expect(result?.warnings.some((w) => w.includes('matched sword by keyword'))).toBe(true);
    expect(result?.warnings.some((w) => w.startsWith('owner:'))).toBe(true);
    expect(result?.warnings.some((w) => w.startsWith('price:'))).toBe(true);
    expect(result?.translations.en['weapon.shusui.name.literal-meaning']).toBe('Autumn Water');
    expect(detectKind(page.wikitext)).toEqual({ kind: 'weapon' });
    const parsed = (await zod('WeaponData')).safeParse(result?.entity);
    expect(parsed.success ? 'ok' : parsed.error?.message).toBe('ok');
  });
});

describe('Arc Box → arc', () => {
  it('strips the " Arc" suffix, maps the subtype, reports the navigation', async () => {
    const page = await fixture('arc-wano-country');
    const result = mapArc(page, ctx);
    expect(result?.entity.id).toBe('arc:wano-country');
    expect(result?.entity.properties['name']).toEqual([
      {
        value_key: 'arc.wano-country.name.common',
        name_type: 'common',
        since: 'manga-chapter:909',
      },
    ]);
    expect(result?.entity.properties['arc_subtype']).toEqual({ value: 'cover_story' });
    for (const param of ['prev', 'next', 'chapter', 'episode', 'date']) {
      expect(result?.warnings.some((w) => w.startsWith(`${param}:`))).toBe(true);
    }
    expect(result?.warnings.some((w) => w.includes('arc_number not in the Arc Box'))).toBe(true);
    expect(detectKind(page.wikitext)).toEqual({ kind: 'arc' });
    const parsed = (await zod('ArcData')).safeParse(result?.entity);
    expect(parsed.success ? 'ok' : parsed.error?.message).toBe('ok');
  });

  it('maps the Filler type onto the arc-subtypes value added by ADR-109', async () => {
    const page = await fixture('arc-wano-country');
    const result = mapArc({ ...page, wikitext: '{{Arc Box|type=Filler}}' }, ctx);
    expect(result?.entity.properties['arc_subtype']).toEqual({ value: 'filler' });
  });
});

describe('emit adapter', () => {
  it('writes the ja / ja-latn translation sidecars alongside en', async () => {
    const result = mapDevilFruit(await fixture('devil-fruit-inu-inu-dachshund'), ctx);
    const paths = buildEmitFiles(result!).map((f) => f.path);
    expect(paths).toEqual([
      'data/universes/one-piece/entities/devil-fruit/inu-inu-no-mi-model-dachshund.json',
      'data/universes/one-piece/translations/en/devil-fruit/inu-inu-no-mi-model-dachshund.json',
      'data/universes/one-piece/translations/ja/devil-fruit/inu-inu-no-mi-model-dachshund.json',
      'data/universes/one-piece/translations/ja-latn/devil-fruit/inu-inu-no-mi-model-dachshund.json',
    ]);
  });
});

describe('mapper contracts', () => {
  it('returns null without the matching infobox', async () => {
    const page = await fixture('crew-black-cat-pirates');
    const prose = { ...page, wikitext: 'just prose' };
    expect(mapCrew(prose, ctx)).toBeNull();
    expect(mapShip(prose, ctx)).toBeNull();
    expect(mapWeapon(prose, ctx)).toBeNull();
    expect(mapArc(prose, ctx)).toBeNull();
    expect(mapOrganization(prose, ctx)).toBeNull();
    expect(mapDevilFruit(prose, ctx)).toBeNull();
  });

  it('degrades to warnings without a ledger or vocabularies', async () => {
    const result = mapShip(await fixture('ship-going-merry'), {});
    expect(result?.entity.relations).toEqual([]);
    expect(result?.warnings.some((w) => w.includes('needs crewed-by resolution'))).toBe(true);
  });
});
