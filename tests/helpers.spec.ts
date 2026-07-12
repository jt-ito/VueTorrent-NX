import { describe, expect, it } from 'vitest'
import { extensionToGlob, globToExtension, normalizeExtension, reconcileNativeExcludedFiles } from '../src/utils/helpers'

describe('helpers', () => {
  describe('normalizeExtension', () => {
    it('normalizes extensions correctly', () => {
      expect(normalizeExtension('nfo')).toBe('.nfo')
      expect(normalizeExtension('.nfo')).toBe('.nfo')
      expect(normalizeExtension('*.nfo')).toBe('.nfo')
      expect(normalizeExtension('  .nfo  ')).toBe('.nfo')
      expect(normalizeExtension('')).toBeNull()
      expect(normalizeExtension('   ')).toBeNull()
      expect(normalizeExtension('*')).toBeNull()
    })
  })

  describe('extensionToGlob', () => {
    it('converts extensions to glob patterns correctly', () => {
      expect(extensionToGlob('.nfo')).toBe('*.nfo')
      expect(extensionToGlob('nfo')).toBe('*.nfo')
      expect(extensionToGlob('.txt')).toBe('*.txt')
    })
  })

  describe('globToExtension', () => {
    it('converts glob patterns back to extensions', () => {
      expect(globToExtension('*.nfo')).toBe('.nfo')
      expect(globToExtension('*.txt')).toBe('.txt')
      expect(globToExtension('*(sample)*')).toBeNull()
      expect(globToExtension('*.')).toBe('.')
    })
  })

  describe('reconcileNativeExcludedFiles', () => {
    it('handles empty or null existing lists', () => {
      const result = reconcileNativeExcludedFiles(null, [], ['.nfo', '.txt'])
      expect(result.finalGlobsStr).toBe('*.nfo\n*.txt')
      expect(result.newPushedGlobs).toEqual(['*.nfo', '*.txt'])
    })

    it('adds new patterns', () => {
      const result = reconcileNativeExcludedFiles('*.exe', [], ['.nfo'])
      expect(result.finalGlobsStr).toBe('*.exe\n*.nfo')
      expect(result.newPushedGlobs).toEqual(['*.nfo'])
    })

    it('removes stale VueTorrent-owned patterns', () => {
      const result = reconcileNativeExcludedFiles('*.exe\n*.nfo', ['*.nfo'], ['.txt'])
      expect(result.finalGlobsStr).toBe('*.exe\n*.txt')
      expect(result.newPushedGlobs).toEqual(['*.txt'])
    })

    it('preserves unrelated user-added patterns', () => {
      const result = reconcileNativeExcludedFiles('*(sample)*\n*.nfo', ['*.nfo'], ['.nfo', '.txt'])
      expect(result.finalGlobsStr).toBe('*(sample)*\n*.nfo\n*.txt')
      expect(result.newPushedGlobs).toEqual(['*.nfo', '*.txt'])
    })

    it('deduplicates patterns', () => {
      const result = reconcileNativeExcludedFiles('*.txt\n*.nfo', [], ['.txt'])
      expect(result.finalGlobsStr).toBe('*.txt\n*.nfo')
    })
  })
})
