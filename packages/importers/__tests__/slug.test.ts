/**
 * La regle d'id, testee a sa source unique.
 *
 * Ces cas ne sont pas inventes : ce sont les formes que Fandom met
 * VRAIMENT entre parentheses — edition, desambiguisation, precision.
 */
import { describe, expect, it } from 'bun:test';
import { slugify, stripParentheticals } from '../src/slug.ts';

describe('stripParentheticals', () => {
  it("retire la mention d'edition", () => {
    expect(stripParentheticals('Belle-Mère (VIZ Media)')).toBe('Belle-Mère');
  });

  it('retire la desambiguisation Fandom', () => {
    expect(stripParentheticals('Zeus (Homies)')).toBe('Zeus');
  });

  it('retire une parenthese au milieu sans coller les mots', () => {
    expect(stripParentheticals('Zoro (Wano) Arc')).toBe('Zoro Arc');
  });

  it("retire plusieurs parentheses d'affilee", () => {
    expect(stripParentheticals('Nami (VIZ) (Funimation)')).toBe('Nami');
  });

  it('ne touche pas a un nom sans parenthese', () => {
    expect(stripParentheticals('Monkey D. Luffy')).toBe('Monkey D. Luffy');
  });
});

describe('slugify', () => {
  it("n'emet aucune donnee entre parentheses dans le slug", () => {
    expect(slugify('Mr. 3 (Galdino)')).toBe('mr-3');
    expect(slugify('Belle-Mère (VIZ Media);')).toBe('belle-mere');
  });

  it('plie les accents et met en kebab-case', () => {
    expect(slugify('Monkey D. Luffy')).toBe('monkey-d-luffy');
    expect(slugify('Bell-mère')).toBe('bell-mere');
  });

  it('respecte la borne de 60 du primitif `Slug`', () => {
    // La copie de `character.ts` ne la respectait pas et pouvait donc
    // produire un id que Zod refuse.
    const long = `${'a'.repeat(40)} ${'b'.repeat(40)}`;
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('rend la chaine vide quand il ne reste rien', () => {
    expect(slugify('(VIZ Media)')).toBe('');
  });
});
