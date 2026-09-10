/**
 * Char Box → character mapper on the REAL Hyougoro response
 * (fixture captured by the maintainer, 2026-06-14).
 */
import { describe, expect, it, test } from 'bun:test';
import { join } from 'node:path';
import { GENERATED_DIR } from '../../schema-engine/src/paths.ts';
import {
  mapCharacter,
  parseBirthday,
  parseBloodType,
  parseBountyEntries,
} from '../src/fandom/character.ts';
import type { ParsedPage } from '../src/fandom/client.ts';
import { buildTitleIndex } from '../src/fandom/registry.ts';
import { parseNihongo, parseQrefs } from '../src/fandom/wikitext.ts';

async function hyougoro(): Promise<ParsedPage> {
  const raw = await Bun.file(
    join(import.meta.dir, 'fixtures', 'hyougoro.json'),
  ).json() as { parse: { title: string; pageid: number; wikitext: string; }; };
  return {
    title: raw.parse.title,
    pageId: raw.parse.pageid,
    wikitext: raw.parse.wikitext,
    url: 'https://onepiece.fandom.com/wiki/Hyougoro',
  };
}

describe('new Qref variants (real Char Box)', () => {
  it('parses cover= and card= into source ids', async () => {
    const page = await hyougoro();
    const ids = parseQrefs(page.wikitext).map((q) => q.sourceId);
    expect(ids).toContain('manga-chapter:1117'); // cover=1117
    expect(ids).toContain('databook-card:1329'); // card=1329 (Vivre Card)
    expect(ids).toContain('manga-chapter:926');
    expect(ids).toContain('anime-episode:919');
  });

  it('parses {{Nihongo}} alias/epithet values', () => {
    const n = parseNihongo(
      '{{Nihongo|"Hyougoro of the Flower"|花のヒョウ五郎|Hana no Hyōgorō|English: "Hyogoro the Flower"}}',
    );
    expect(n).toMatchObject({
      text: 'Hyougoro of the Flower',
      kanji: '花のヒョウ五郎',
      romaji: 'Hana no Hyōgorō',
    });
  });

  it('parses birthdays to the corpus MM-DD shape', () => {
    expect(parseBirthday('February 14th')).toBe('02-14');
    expect(parseBirthday('May 5')).toBe('05-05');
    expect(parseBirthday('sometime in spring')).toBeNull();
  });
});

describe('character mapper (real Char Box)', () => {
  it('maps the deterministic scalars with per-value provenance', async () => {
    const result = mapCharacter(await hyougoro());
    expect(result).not.toBeNull();
    const entity = result!.entity;
    expect(entity).toMatchObject({
      id: 'character:hyogoro',
      slug: 'hyogoro',
      canonical_name_key: 'character.hyogoro.name.common',
    });
    // name: common (debut since) + alias from {{Nihongo}}.
    const names = entity.properties['name'] as readonly Record<string, unknown>[];
    expect(names[0]).toMatchObject({
      value_key: 'character.hyogoro.name.common',
      name_type: 'common',
      since: 'manga-chapter:926',
    });
    expect(names[1]).toMatchObject({ name_type: 'alias' });
    expect(result!.translations.en['character.hyogoro.name.common']).toBe('Hyogoro');
    // Vivre-Card-sourced measured facts.
    expect(entity.properties['age']).toEqual([
      { value: 70, source: 'databook-card:1329' },
    ]);
    expect(entity.properties['height']).toEqual([
      { value: 100, source: 'databook-card:1329' },
    ]);
    expect(entity.properties['birthday']).toEqual({ value: '02-14' });
    expect(entity.properties['blood_type']).toEqual({ value: 'S' });
    // Status inferred (no param) — flagged, not silent.
    expect(entity.properties['status']).toEqual([
      { value: 'alive', since: 'manga-chapter:926' },
    ]);
    expect(result!.warnings.some((w) => w.includes('defaulted to alive'))).toBe(true);
    // Needs-resolution params surface as warnings.
    expect(result!.warnings.some((w) => w.startsWith('affiliation:'))).toBe(true);
    expect(result!.warnings.some((w) => w.startsWith('jva:'))).toBe(true);
  });

  it('validates against the generated character Zod', async () => {
    const mod = (await import(join(GENERATED_DIR, 'entities.ts'))) as {
      CharacterData: {
        safeParse: (v: unknown) => { success: boolean; error?: { message: string; }; };
      };
    };
    const result = mapCharacter(await hyougoro());
    const parsed = mod.CharacterData.safeParse(result!.entity);
    // Surface the Zod message through the assertion on failure.
    expect(parsed.success ? 'ok' : parsed.error?.message).toBe('ok');
  });

  it('returns null without a Char Box or ename', async () => {
    const page = await hyougoro();
    expect(mapCharacter({ ...page, wikitext: 'prose only' })).toBeNull();
    expect(mapCharacter({ ...page, wikitext: '{{Char Box|jname=x}}' })).toBeNull();
  });
});

function syntheticPage(wikitext: string): ParsedPage {
  return {
    title: 'Test Page',
    pageId: 1,
    wikitext,
    url: 'https://onepiece.fandom.com/wiki/Test_Page',
  };
}

describe('bounty history parsing', () => {
  it('parses newest-first <br> lines into chronological entries with per-value since', () => {
    const { entries, warnings } = parseBountyEntries(
      '{{B}} 3,000,000,000{{Qref|chap=1053}}<br/>1,500,000,000{{Qref|chap=903}}'
        + '<br>500,000,000{{Qref|chap=801|ep=746}}',
      new Map(),
    );
    expect(warnings).toEqual([]);
    expect(entries).toEqual([
      { value: 500_000_000, since: 'manga-chapter:801' },
      { value: 1_500_000_000, since: 'manga-chapter:903' },
      { value: 3_000_000_000, since: 'manga-chapter:1053' },
    ]);
  });

  it('keeps already-chronological lists, skips numberless lines, flags missing Qrefs', () => {
    const { entries, warnings } = parseBountyEntries(
      '50{{Qref|chap=98}}<br>Unknown<br>100', // oldest-first, one dud
      new Map(),
    );
    expect(entries).toEqual([{ value: 50, since: 'manga-chapter:98' }, { value: 100 }]);
    expect(warnings.some((w) => w.includes('without a number'))).toBe(true);
    expect(warnings.some((w) => w.includes('no Qref'))).toBe(true);
  });
});

describe('status vocabulary mapping', () => {
  const base = '{{Char Box|ename=Test Guy|first=Chapter 1{{Qref|chap=1}}';

  it.each([
    ['Deceased{{Qref|chap=574}}', 'dead', 'manga-chapter:574'],
    ['Presumed Deceased', 'presumed_dead', 'manga-chapter:1'],
    ['Missing', 'missing', 'manga-chapter:1'],
    ['Unknown', 'unknown', 'manga-chapter:1'],
  ])('maps "%s" → %s', (raw, expected, since) => {
    const result = mapCharacter(syntheticPage(`${base}|status=${raw}}}`));
    expect(result!.entity.properties['status']).toEqual([{ value: expected, since }]);
  });
});

describe('registry-resolved relations + occupation matching', () => {
  const titleIndex = buildTitleIndex({
    pages: [
      {
        entityId: 'crew:straw-hat-pirates',
        page: 'Straw Hat Pirates',
        pageId: 10,
        redirects: ['Strawhat Crew'],
      },
      { entityId: 'location:wano', page: 'Wano Country', pageId: 11, redirects: [] },
      {
        entityId: 'devil-fruit:gomu-gomu-no-mi',
        page: 'Gomu Gomu no Mi',
        pageId: 12,
        redirects: [],
      },
      { entityId: 'character:roronoa-zoro', page: 'Roronoa Zoro', pageId: 13, redirects: [] },
    ],
  });
  const occupations = new Map([
    ['pirate', 'pirate'],
    ['captain', 'captain'],
    ['cook', 'cook'],
  ]);
  const page = syntheticPage(
    '{{Char Box|ename=Test Guy|first=Chapter 1{{Qref|chap=1}}'
      + '|affiliation=[[Straw Hat Pirates]]{{Qref|chap=5}}<br>[[Roronoa Zoro]]'
      + '|origin=[[Wano Country]]'
      + '|residence=[[Nowhere Island]]'
      + '|dfname=[[Gomu Gomu no Mi]]'
      + '|occupation=Pirate; Captain<br>Cartographer<br>Cook (former)}}',
  );

  it('emits relations for registry-resolved targets of the right type only', () => {
    const result = mapCharacter(page, { titleIndex, occupations });
    expect(result!.entity.relations).toEqual([
      {
        type: 'member-of',
        target: 'crew:straw-hat-pirates',
        qualifiers: { since: 'manga-chapter:5' },
      },
      { type: 'originates-from', target: 'location:wano' },
      { type: 'ate-fruit', target: 'devil-fruit:gomu-gomu-no-mi' },
    ]);
    // Wrong-type target (a character can't be a member-of target),
    // unknown page, and former lines all surface as warnings.
    expect(result!.warnings.some((w) => w.includes('not a valid member-of target'))).toBe(true);
    expect(result!.warnings.some((w) => w.includes('unresolved "[[Nowhere Island]]"'))).toBe(true);
  });

  it('matches occupations exactly against the vocabulary, flags the rest', () => {
    const result = mapCharacter(page, { titleIndex, occupations });
    expect(result!.entity.properties['occupation']).toEqual([
      { value: ['pirate', 'captain'], since: 'manga-chapter:1' },
    ]);
    expect(result!.warnings.some((w) => w.includes('"Cartographer" has no vocabulary match')))
      .toBe(true);
    expect(result!.warnings.some((w) => w.includes('"Cook (former)" is former'))).toBe(true);
  });

  it('degrades to v1 warnings without a context', () => {
    const result = mapCharacter(page);
    expect(result!.entity.relations).toEqual([]);
    expect(result!.entity.properties['occupation']).toBeUndefined();
    expect(result!.warnings.some((w) => w.startsWith('affiliation:'))).toBe(true);
    expect(result!.warnings.some((w) => w.startsWith('occupation:'))).toBe(true);
  });
});

describe("`ename` multi-ligne : la mention d'edition n'est pas le nom", () => {
  const page = (title: string, ename: string): ParsedPage => ({
    title,
    pageId: 1,
    url: `https://onepiece.fandom.com/wiki/${title}`,
    wikitext: `{{Char Box\n|ename = ${ename}\n|status = Alive\n}}`,
  });

  /** Le champ REEL, releve dans le corpus importe. */
  const BELL_MERE = 'Belle-Mère (VIZ Media);<br>Bellemere (Funimation);<br>Bell-mère (OPCG)';

  it("retire la parenthese d'edition de la ligne canonique", () => {
    // Le premier correctif coupait bien sur `<br>` mais gardait la
    // parenthese : le slug restait `belle-mere-viz-media`.
    const result = mapCharacter(page('Bell-mère', BELL_MERE));
    expect(result).not.toBeNull();
    expect(result!.entity.slug).toBe('belle-mere');
    expect(result!.entity.id).toBe('character:belle-mere');
  });

  it("garde CHAQUE orthographe d'edition comme alias, telle quelle", () => {
    const result = mapCharacter(page('Bell-mère', BELL_MERE));
    const names = result!.entity.properties['name'] as { name_type: string; value_key: string; }[];
    expect(names[0]).toMatchObject({ name_type: 'common' });
    const values = names
      .filter((n) => n.name_type === 'alias')
      .map((a) => result!.translations['en']?.[a.value_key]);
    expect(values).toContain('Bellemere (Funimation);');
    expect(values).toContain('Bell-mère (OPCG)');
  });

  it('retire la parenthese du SLUG meme sur une seule ligne', () => {
    // Regle produit : aucune donnee entre parentheses dans un id.
    // Ce test disait l'inverse il y a un commit — la parenthese d'une
    // ligne unique etait gardee faute de savoir ce qu'elle portait.
    const result = mapCharacter(page('Mr. 3', 'Mr. 3 (Galdino)'));
    expect(result!.entity.slug).toBe('mr-3');
    expect(result!.entity.id).toBe('character:mr-3');
  });

  it("garde la parenthese dans le NOM AFFICHE d'une ligne unique", () => {
    // La regle porte sur l'id, pas sur ce que la page ecrit.
    const result = mapCharacter(page('Mr. 3', 'Mr. 3 (Galdino)'));
    const key = result!.entity.canonical_name_key;
    expect(result!.translations['en']?.[key]).toBe('Mr. 3 (Galdino)');
  });

  it("n'invente aucun alias sur le cas ordinaire", () => {
    // 139 des 148 personnages du dernier crawl.
    const result = mapCharacter(page('Nami', 'Nami'));
    const names = result!.entity.properties['name'] as { name_type: string; }[];
    expect(result!.entity.slug).toBe('nami');
    expect(names.filter((n) => n.name_type === 'alias')).toEqual([]);
  });
});

describe('parseBloodType', () => {
  test('les quatre groupes du vocabulaire passent', () => {
    expect(parseBloodType('S')).toBe('S');
    expect(parseBloodType('f')).toBe('F');
    expect(parseBloodType('XF')).toBe('XF');
    expect(parseBloodType('X')).toBe('X');
  });

  test('une précision entre parenthèses tombe, la valeur reste', () => {
    // Charlotte Praline : « S (RH-) » — la parenthèse porte une
    // précision, pas l'identité (ADR-124).
    expect(parseBloodType('S (RH-)')).toBe('S');
  });

  test('trois valeurs dans un champ ne se choisissent pas', () => {
    // Baskerville a trois têtes et un seul champ. Choisir, ce serait
    // inventer : le mapper refuse et avertit.
    expect(parseBloodType('Bas: X And: XF Kerville: F')).toBeNull();
    expect(parseBloodType('')).toBeNull();
    expect(parseBloodType('AB')).toBeNull();
  });
});

describe('le triplet de noms', () => {
  it('sort le nom japonais et sa romanisation', async () => {
    const page = await hyougoro();
    const result = mapCharacter(page, { titleIndex: buildTitleIndex({ pages: [] }) });
    const key = 'character.hyogoro.name.common';
    // `jname` est rempli a 100 % sur les 500 Char Box relevees ; ce
    // mapper ne lisait que `ename`, et 451 personnages importes
    // n'avaient donc aucune locale japonaise.
    expect(result?.translations.ja).toEqual({ [key]: 'ヒョウ五郎' });
    // `rname` arrive en italiques wiki : elles tombent au nettoyage.
    expect(result?.translations['ja-latn']).toEqual({ [key]: 'Hyōgorō' });
  });

  it('la cle japonaise est celle du nom canonique, pas une clé à part', async () => {
    const page = await hyougoro();
    const result = mapCharacter(page, { titleIndex: buildTitleIndex({ pages: [] }) });
    // Un nom japonais est une TRADUCTION du nom (ADR-095), pas une
    // seconde propriete : il partage donc la cle `name.common`.
    expect(Object.keys(result?.translations.ja ?? {})).toEqual(['character.hyogoro.name.common']);
    expect(result?.translations.en['character.hyogoro.name.common']).toBe('Hyogoro');
  });

  it('sans paire japonaise, les locales ne sont pas emises', async () => {
    const page = await hyougoro();
    const stripped = page.wikitext
      .replace(/\|jname\s*=[^\n]*\n/, '')
      .replace(/\|rname\s*=[^\n]*\n/, '');
    const result = mapCharacter(
      { ...page, wikitext: stripped },
      { titleIndex: buildTitleIndex({ pages: [] }) },
    );
    expect(result?.translations.en).toBeDefined();
    expect(result?.translations.ja).toBeUndefined();
    expect(result?.translations['ja-latn']).toBeUndefined();
  });
});
