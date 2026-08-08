/**
 * Per-row completeness for the entity list endpoint (ADR-083).
 */
import { describe, expect, it } from 'bun:test';
import { completenessExpectation, computeCompleteness } from '../completeness.ts';

const entityType = {
  properties: [
    { id: 'name', required: true, recommended: false },
    { id: 'status', required: true, recommended: false },
    { id: 'bounty', required: false, recommended: true },
    { id: 'birthday', required: false, recommended: true },
    { id: 'height', required: false, recommended: false },
  ],
  recommended_relations: ['member-of', 'voiced-by'],
};

describe('completenessExpectation', () => {
  it('collects required + recommended properties and recommended relations', () => {
    const exp = completenessExpectation(entityType);
    expect(exp.propertyIds).toEqual(['name', 'status', 'bounty', 'birthday']);
    expect(exp.relationTypeIds).toEqual(['member-of', 'voiced-by']);
  });

  it('is empty for an unknown entity type', () => {
    const exp = completenessExpectation(undefined);
    expect(exp).toEqual({ propertyIds: [], relationTypeIds: [] });
    expect(computeCompleteness({}, exp)).toEqual({ filled: 0, expected: 0 });
  });

  it('handles a type with no recommended_relations declared', () => {
    const exp = completenessExpectation({ properties: entityType.properties });
    expect(exp.relationTypeIds).toEqual([]);
  });
});

describe('computeCompleteness', () => {
  const expectation = completenessExpectation(entityType);

  it('counts filled properties and relation types out of the expectation', () => {
    const data = {
      properties: {
        name: [{ value_key: 'k' }],
        status: [{ value: 'alive' }],
        bounty: [{ value: 16_000_000 }],
        // birthday missing; height filled but NOT expected → ignored.
        height: [{ value: '178cm' }],
      },
      relations: [
        { type: 'member-of', target: 'crew:straw-hat-pirates' },
        // Second member-of must not double-count.
        { type: 'member-of', target: 'organization:cross-guild' },
        { type: 'enemy-of', target: 'character:kuro' },
      ],
    };
    expect(computeCompleteness(data, expectation)).toEqual({ filled: 4, expected: 6 });
  });

  it('treats an empty array or missing key as unfilled, a single object as filled', () => {
    const data = {
      properties: {
        name: [],
        // Non-historical properties are stored as one entry object,
        // not an array — presence counts as filled.
        birthday: { value: '05-05' },
      },
      relations: [],
    };
    expect(computeCompleteness(data, expectation)).toEqual({ filled: 1, expected: 6 });
  });

  it('is defensive about malformed data shapes', () => {
    const data = {
      properties: 'not-an-object',
      relations: [null, 42, { target: 'no-type' }],
    };
    expect(computeCompleteness(data, expectation)).toEqual({ filled: 0, expected: 6 });
    expect(computeCompleteness({}, expectation)).toEqual({ filled: 0, expected: 6 });
  });
});
