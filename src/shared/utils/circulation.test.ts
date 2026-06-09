import { classifyCirculation } from './circulation';

describe('classifyCirculation', () => {
  it('classifies in-circulation statuses as IN', () => {
    expect(classifyCirculation('APPLIED')).toBe('IN');
    expect(classifyCirculation('INTRODUCED')).toBe('IN');
    expect(classifyCirculation('IN_CIRCULATION')).toBe('IN');
    expect(classifyCirculation('in_circulation')).toBe('IN'); // case-insensitive
  });

  it('classifies out-of-circulation statuses as OUT', () => {
    expect(classifyCirculation('WITHDRAWN')).toBe('OUT');
    expect(classifyCirculation('RETIRED')).toBe('OUT');
    expect(classifyCirculation('SOLD')).toBe('OUT');
    expect(classifyCirculation('EMITTED')).toBe('OUT'); // not yet in circulation
  });

  it('returns UNKNOWN for missing or unrecognized statuses', () => {
    expect(classifyCirculation(undefined)).toBe('UNKNOWN');
    expect(classifyCirculation(null)).toBe('UNKNOWN');
    expect(classifyCirculation('')).toBe('UNKNOWN');
    expect(classifyCirculation('SOMETHING_NEW')).toBe('UNKNOWN');
  });
});
