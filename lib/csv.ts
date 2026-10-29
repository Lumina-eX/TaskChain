/**
 * CSV Serialization Utility
 *
 * Minimal, dependency-free CSV serializer used by the ledger and
 * reconciliation export endpoints.  Handles:
 *  • Escaping values that contain commas, quotes, or newlines (RFC 4180).
 *  • Optional header row generation.
 *  • Consistent line endings (\r\n).
 *
 * Usage:
 *   const csv = toCSV(rows, { headers: ['id', 'amount'] })
 */

export interface CSVColumn<T> {
  /** Property key on the source object */
  key: keyof T | string
  /** Column header in the CSV output */
  header: string
  /** Optional transform applied before serialization */
  format?: (value: T[keyof T] | T, row: T) => string | number | null | undefined
}

export interface CSVOption<T> {
  columns: CSVColumn<T>[]
  /** Include header row (default: true) */
  includeHeader?: boolean
}

/**
 * Escape a single cell value per RFC 4180:
 * wrap in double-quotes if the value contains comma, quote, CR, or LF,
 * and double any embedded quotes.
 */
export function escapeCSVCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Serialize an array of objects into a CSV string.
 */
export function toCSV<T>(rows: T[], options: CSVOption<T>): string {
  const { columns, includeHeader = true } = options
  const lines: string[] = []

  if (includeHeader) {
    lines.push(columns.map((c) => escapeCSVCell(c.header)).join(','))
  }

  for (const row of rows) {
    const cells = columns.map((col) => {
      if (col.format) {
        return escapeCSVCell(col.format(row, row))
      }
      const val = (row as Record<string, unknown>)[col.key as string]
      return escapeCSVCell(val)
    })
    lines.push(cells.join(','))
  }

  return lines.join('\r\n')
}

/**
 * Build a Content-Disposition header value for a CSV download.
 */
export function csvContentDisposition(filename: string): string {
  return `attachment; filename="${filename}"`
}

/**
 * Sanitize a filename by replacing unsafe characters.
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_')
}
