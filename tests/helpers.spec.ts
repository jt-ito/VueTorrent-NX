import { describe, expect, it } from 'vitest'
import { extensionToGlob, globToExtension, normalizeExtension, reconcileNativeExcludedFiles, runWithConcurrency, decodeHtmlEntities } from '../src/utils/helpers'

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

  describe('runWithConcurrency', () => {
    it('never runs more than `limit` tasks at once and runs every item', async () => {
      let active = 0
      let peak = 0
      const done: number[] = []
      await runWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async n => {
        active++
        peak = Math.max(peak, active)
        await new Promise(r => setTimeout(r, 5))
        active--
        done.push(n)
      })
      expect(peak).toBe(3)
      expect(done.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })

    it('keeps going when a task throws', async () => {
      const done: number[] = []
      await runWithConcurrency([1, 2, 3], 1, async n => {
        if (n === 2) throw new Error('boom')
        done.push(n)
      })
      expect(done).toEqual([1, 3])
    })

    it('handles an empty list', async () => {
      await expect(runWithConcurrency([], 4, async () => {})).resolves.toBeUndefined()
    })
  })

  describe('decodeHtmlEntities', () => {
    it('decodes the common named entities', () => {
      expect(decodeHtmlEntities('Kashita Maryoku wa &quot;Revo Barai&quot; de Kyousei Choushuu')).toBe('Kashita Maryoku wa "Revo Barai" de Kyousei Choushuu')
      expect(decodeHtmlEntities('Tom &amp; Jerry &lt;1080p&gt; it&apos;s')).toBe("Tom & Jerry <1080p> it's")
    })

    it('decodes numeric entities', () => {
      expect(decodeHtmlEntities('it&#39;s &#x22;ok&#x22; &#8217;')).toBe("it's \"ok\" ’")
    })

    it('leaves unknown, invalid and plain text alone', () => {
      expect(decodeHtmlEntities('Fish & Chips')).toBe('Fish & Chips')
      expect(decodeHtmlEntities('&unknown; &#0; &#xD800; &#99999999;')).toBe('&unknown; &#0; &#xD800; &#99999999;')
      expect(decodeHtmlEntities('')).toBe('')
    })

    it('decodes one level only', () => {
      expect(decodeHtmlEntities('&amp;quot;')).toBe('&quot;')
    })

    it('never interprets markup: tags stay plain text', () => {
      expect(decodeHtmlEntities('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>')
      expect(decodeHtmlEntities('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('<script>alert(1)</script>')
    })
  })
})
