import { describe, it, expect } from 'vitest'
import { escapeCSVCell, toCSV, csvContentDisposition, sanitizeFilename } from '@/lib/csv'

describe('CSV utility', () => {
  describe('escapeCSVCell', () => {
    it('returns empty string for null/undefined', () => {
      expect(escapeCSVCell(null)).toBe('')
      expect(escapeCSVCell(undefined)).toBe('')
    })

    it('returns plain values unchanged', () => {
      expect(escapeCSVCell('hello')).toBe('hello')
      expect(escapeCSVCell(123)).toBe('123')
      expect(escapeCSVCell(true)).toBe('true')
    })

    it('quotes values containing commas', () => {
      expect(escapeCSVCell('a,b')).toBe('"a,b"')
    })

    it('quotes values containing double-quotes and escapes them', () => {
      expect(escapeCSVCell('say "hi"')).toBe('"say ""hi"""')
    })

    it('quotes values containing newlines', () => {
      expect(escapeCSVCell('line1\nline2')).toBe('"line1\nline2"')
      expect(escapeCSVCell('line1\r\nline2')).toBe('"line1\r\nline2"')
    })

    it('serializes objects as JSON with escaped quotes', () => {
      const result = escapeCSVCell({ key: 'value' })
      // JSON.stringify produces {"key":"value"}, then CSV escaping wraps in
      // double quotes and doubles the inner quotes → "{""key"":""value""}"
      expect(result).toBe('"{""key"":""value""}"')
    })
  })

  describe('toCSV', () => {
    interface Row {
      id: string
      name: string
      amount: number
    }

    it('generates header row by default', () => {
      const csv = toCSV<Row>([], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'amount', header: 'Amount' },
        ],
      })
      expect(csv).toBe('ID,Name,Amount')
    })

    it('skips header when includeHeader=false', () => {
      const csv = toCSV<Row>(
        [{ id: '1', name: 'Alice', amount: 100 }],
        {
          columns: [
            { key: 'id', header: 'ID' },
            { key: 'name', header: 'Name' },
            { key: 'amount', header: 'Amount' },
          ],
          includeHeader: false,
        }
      )
      expect(csv).toBe('1,Alice,100')
    })

    it('serializes multiple rows', () => {
      const csv = toCSV<Row>(
        [
          { id: '1', name: 'Alice', amount: 100 },
          { id: '2', name: 'Bob, Jr.', amount: 200 },
        ],
        {
          columns: [
            { key: 'id', header: 'ID' },
            { key: 'name', header: 'Name' },
            { key: 'amount', header: 'Amount' },
          ],
        }
      )
      expect(csv).toBe('ID,Name,Amount\r\n1,Alice,100\r\n2,"Bob, Jr.",200')
    })

    it('uses format function when provided', () => {
      const csv = toCSV<Row>(
        [{ id: '1', name: 'Alice', amount: 100.5 }],
        {
          columns: [
            { key: 'id', header: 'ID' },
            {
              key: 'amount',
              header: 'Amount',
              format: (row) => `$${(row.amount).toFixed(2)}`,
            },
          ],
        }
      )
      expect(csv).toBe('ID,Amount\r\n1,$100.50')
    })
  })

  describe('csvContentDisposition', () => {
    it('returns attachment disposition with filename', () => {
      expect(csvContentDisposition('report.csv')).toBe('attachment; filename="report.csv"')
    })
  })

  describe('sanitizeFilename', () => {
    it('replaces unsafe characters with underscores', () => {
      expect(sanitizeFilename('report 2024/10/17.csv')).toBe('report_2024_10_17.csv')
    })

    it('collapses consecutive underscores', () => {
      expect(sanitizeFilename('a   b')).toBe('a_b')
    })

    it('keeps dots and dashes', () => {
      expect(sanitizeFilename('my-report.v2.csv')).toBe('my-report.v2.csv')
    })
  })
})
