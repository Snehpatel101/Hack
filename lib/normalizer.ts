// ============================================================
// Equity Finance Copilot — Universal Financial Data Normalizer
// ============================================================
//
// A self-contained schema-inference + normalization pipeline that
// accepts raw CSV or JSON financial data from any bank/institution,
// infers column mappings heuristically, and produces a uniform
// NormalizedTransaction[] output with category totals and warnings.
// ============================================================

// ------------------------------------------------------------
// 1. Exported Types
// ------------------------------------------------------------

/** A fully normalized, enriched transaction record. */
export interface NormalizedTransaction {
  /** Auto-generated identifier in the form `txn_{index}_{hash}`. */
  id: string;
  /** Transaction date in ISO 8601 format (YYYY-MM-DD). */
  dateISO: string;
  /** Cleaned merchant/description string. */
  description: string;
  /** Best-effort extracted merchant name. */
  merchant: string;
  /** Signed amount: negative = spend, positive = income. */
  amountSigned: number;
  /** Inferred category or "uncategorized". */
  category: string;
  /** Source account if detected, otherwise "default". */
  account: string;
  /** Running balance if present in source data, otherwise null. */
  balance: number | null;
  /** Detected currency code or "USD". */
  currency: string;
  /** All original columns preserved as key-value pairs. */
  sourceMeta: Record<string, string>;
}

/** Describes how a source column was mapped to an internal field. */
export interface FieldMapping {
  /** The original column header from the source data. */
  sourceColumn: string;
  /** The internal NormalizedTransaction field name this maps to. */
  internalField: string;
  /** Confidence score from 0 to 1. */
  confidence: number;
  /** Human-readable explanation of how the mapping was inferred. */
  method: string;
}

/** Complete result of the normalization pipeline. */
export interface NormalizationResult {
  /** Array of normalized transaction records. */
  normalizedTransactions: NormalizedTransaction[];
  /** Actionable warnings generated during processing. */
  warnings: string[];
  /** Column-to-field mappings inferred by the schema engine. */
  schemaMap: FieldMapping[];
  /** Category name to total absolute spend (negative amounts only). */
  categoryTotals: Record<string, number>;
  /** Sum of all spending (absolute value of all negative amounts). */
  totalSpend: number;
}

// ------------------------------------------------------------
// Internal type for the parsed raw format shared between CSV/JSON
// ------------------------------------------------------------

interface ParsedRaw {
  headers: string[];
  rows: Record<string, string>[];
}

// ------------------------------------------------------------
// 2. CSV Parsing
// ------------------------------------------------------------

/**
 * Parse a raw CSV string into headers and row records.
 *
 * Handles:
 * - Quoted fields (commas inside double-quotes)
 * - Escaped quotes within quoted fields (`""`)
 * - Whitespace trimming on headers and cell values
 * - Empty lines and trailing newlines
 *
 * @param csv - Raw CSV content as a string.
 * @returns An object with lowercased/trimmed `headers` and an array of `rows`,
 *          where each row is a `Record<headerName, cellValue>`.
 */
export function parseCSVRaw(csv: string): ParsedRaw {
  const lines = splitCSVLines(csv);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());

  if (headers.length === 0 || headers.every((h) => h === "")) {
    return { headers: [], rows: [] };
  }

  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.length === 0 || (cells.length === 1 && cells[0].trim() === "")) {
      continue;
    }

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = j < cells.length ? cells[j].trim() : "";
    }
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Split a CSV string into logical lines, respecting quoted fields
 * that may contain newline characters.
 */
function splitCSVLines(csv: string): string[] {
  const lines: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];

    if (ch === '"') {
      // Toggle quote state (handles escaped "" inside the loop naturally
      // because two consecutive quotes flip twice: on -> off -> on stays same net)
      insideQuotes = !insideQuotes;
      current += ch;
    } else if ((ch === "\n" || ch === "\r") && !insideQuotes) {
      // End of logical line
      if (ch === "\r" && i + 1 < csv.length && csv[i + 1] === "\n") {
        i++; // skip \n in \r\n
      }
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        lines.push(trimmed);
      }
      current = "";
    } else {
      current += ch;
    }
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) {
    lines.push(trimmed);
  }

  return lines;
}

/**
 * Parse a single CSV line into an array of cell values, handling
 * quoted fields and escaped double-quotes.
 */
function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let insideQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (insideQuotes) {
      if (ch === '"') {
        // Check for escaped quote ""
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        insideQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
    } else {
      if (ch === '"') {
        insideQuotes = true;
        i++;
      } else if (ch === ",") {
        cells.push(current);
        current = "";
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }

  cells.push(current);
  return cells;
}

// ------------------------------------------------------------
// 3. JSON Parsing
// ------------------------------------------------------------

/**
 * Parse a raw JSON string into headers and row records.
 *
 * Handles:
 * - A plain array of objects: `[{...}, {...}]`
 * - Nested wrappers: `{ transactions: [...] }`, `{ data: [...] }`, `{ records: [...] }`
 * - Converts all values to strings for uniform downstream processing
 * - Extracts all unique keys as headers
 *
 * @param json - Raw JSON content as a string.
 * @returns An object with `headers` (unique keys) and `rows` (each value stringified).
 */
export function parseJSONRaw(json: string): ParsedRaw {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    return { headers: [], rows: [] };
  }

  let items: unknown[] = [];

  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed !== null && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    // Look for common wrapper keys in priority order
    const wrapperKeys = ["transactions", "data", "records"];
    for (const key of wrapperKeys) {
      if (key in obj && Array.isArray(obj[key])) {
        items = obj[key] as unknown[];
        break;
      }
    }

    // If no wrapper key matched, check all keys for an array value
    if (items.length === 0) {
      for (const key of Object.keys(obj)) {
        if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length > 0) {
          items = obj[key] as unknown[];
          break;
        }
      }
    }
  }

  if (items.length === 0) {
    return { headers: [], rows: [] };
  }

  // Collect all unique keys across all items
  const headerSet = new Set<string>();
  for (const item of items) {
    if (item !== null && typeof item === "object") {
      for (const key of Object.keys(item as Record<string, unknown>)) {
        headerSet.add(key.trim().toLowerCase());
      }
    }
  }

  const headers = Array.from(headerSet);

  const rows: Record<string, string>[] = [];
  for (const item of items) {
    if (item === null || typeof item !== "object") {
      continue;
    }

    const rawObj = item as Record<string, unknown>;
    const row: Record<string, string> = {};

    // Build a lowercase-key lookup for the source object
    const lowerKeyMap: Record<string, unknown> = {};
    for (const key of Object.keys(rawObj)) {
      lowerKeyMap[key.trim().toLowerCase()] = rawObj[key];
    }

    for (const header of headers) {
      const val = lowerKeyMap[header];
      if (val === undefined || val === null) {
        row[header] = "";
      } else if (typeof val === "object") {
        row[header] = JSON.stringify(val);
      } else {
        row[header] = String(val);
      }
    }

    rows.push(row);
  }

  return { headers, rows };
}

// ------------------------------------------------------------
// 4. Schema Inference Engine
// ------------------------------------------------------------

/** Header regex patterns and their confidence levels for each internal field. */
interface FieldRule {
  internalField: string;
  /** Ordered list of pattern/confidence pairs. First match wins within a rule. */
  patterns: { regex: RegExp; confidence: number; label: string }[];
  /** Optional content-level validator run on sample values. */
  contentValidator?: (values: string[]) => boolean;
}

/** All heuristic rules for schema inference, ordered by field priority. */
const FIELD_RULES: FieldRule[] = [
  {
    internalField: "date",
    patterns: [
      { regex: /^date$/i, confidence: 0.95, label: "exact header match 'date'" },
      { regex: /^transaction[\s_-]*date$/i, confidence: 0.95, label: "header match 'transaction date'" },
      { regex: /^posting[\s_-]*date$/i, confidence: 0.93, label: "header match 'posting date'" },
      { regex: /^posted$/i, confidence: 0.90, label: "header match 'posted'" },
      { regex: /trans.*date/i, confidence: 0.88, label: "partial match 'trans*date'" },
      { regex: /effective/i, confidence: 0.85, label: "partial match 'effective'" },
      { regex: /settlement/i, confidence: 0.85, label: "partial match 'settlement'" },
      { regex: /value[\s._-]*date/i, confidence: 0.85, label: "partial match 'value date'" },
      { regex: /posting/i, confidence: 0.82, label: "partial match 'posting'" },
      { regex: /^when$/i, confidence: 0.80, label: "header match 'when'" },
      { regex: /^trans[\s_-]*dt$/i, confidence: 0.85, label: "header match 'trans dt'" },
      { regex: /^txn[\s_-]*date$/i, confidence: 0.90, label: "header match 'txn date'" },
      { regex: /^booked$/i, confidence: 0.85, label: "header match 'booked'" },
      { regex: /^processed$/i, confidence: 0.82, label: "header match 'processed'" },
      { regex: /^created[\s_-]*(at|date)?$/i, confidence: 0.80, label: "header match 'created/created_at'" },
      { regex: /^timestamp$/i, confidence: 0.78, label: "header match 'timestamp'" },
      { regex: /^day$/i, confidence: 0.75, label: "header match 'day'" },
      { regex: /date|dt$/i, confidence: 0.70, label: "catch-all partial match 'date' or 'dt'" },
    ],
    contentValidator: (values) => {
      const parseable = values.filter((v) => v.trim() !== "").filter((v) => parseDateFlex(v) !== null);
      return parseable.length >= Math.ceil(values.filter((v) => v.trim() !== "").length * 0.5);
    },
  },
  {
    internalField: "description",
    patterns: [
      { regex: /^description$/i, confidence: 0.95, label: "exact header match 'description'" },
      { regex: /^memo$/i, confidence: 0.95, label: "exact header match 'memo'" },
      { regex: /^desc$/i, confidence: 0.93, label: "header match 'desc'" },
      { regex: /^narrative$/i, confidence: 0.90, label: "header match 'narrative'" },
      { regex: /^payee$/i, confidence: 0.90, label: "header match 'payee'" },
      { regex: /^merchant$/i, confidence: 0.90, label: "header match 'merchant'" },
      { regex: /^details$/i, confidence: 0.88, label: "header match 'details'" },
      { regex: /^particulars$/i, confidence: 0.88, label: "header match 'particulars'" },
      { regex: /^reference$/i, confidence: 0.80, label: "header match 'reference'" },
      { regex: /^name$/i, confidence: 0.80, label: "header match 'name'" },
      { regex: /desc|memo|narrative/i, confidence: 0.80, label: "partial match description-like" },
      { regex: /^transaction[\s_-]*description$/i, confidence: 0.93, label: "header match 'transaction description'" },
      { regex: /^trans[\s_-]*desc$/i, confidence: 0.88, label: "header match 'trans desc'" },
      { regex: /^remark/i, confidence: 0.85, label: "header match 'remark/remarks'" },
      { regex: /^note/i, confidence: 0.80, label: "header match 'note/notes'" },
      { regex: /^label$/i, confidence: 0.78, label: "header match 'label'" },
      { regex: /^vendor$/i, confidence: 0.85, label: "header match 'vendor'" },
      { regex: /^counterparty$/i, confidence: 0.85, label: "header match 'counterparty'" },
      { regex: /^recipient$/i, confidence: 0.80, label: "header match 'recipient'" },
      { regex: /^sender$/i, confidence: 0.78, label: "header match 'sender'" },
      { regex: /^title$/i, confidence: 0.75, label: "header match 'title'" },
    ],
    contentValidator: (values) => {
      const nonEmpty = values.filter((v) => v.trim() !== "");
      if (nonEmpty.length === 0) return false;
      const textLike = nonEmpty.filter((v) => isNaN(Number(v.replace(/[,$]/g, ""))) && v.length > 3);
      return textLike.length >= Math.ceil(nonEmpty.length * 0.5);
    },
  },
  {
    internalField: "amount",
    patterns: [
      { regex: /^amount$/i, confidence: 0.95, label: "exact header match 'amount'" },
      { regex: /^amt$/i, confidence: 0.90, label: "header match 'amt'" },
      { regex: /^sum$/i, confidence: 0.85, label: "header match 'sum'" },
      { regex: /^total$/i, confidence: 0.85, label: "header match 'total'" },
      { regex: /^value$/i, confidence: 0.80, label: "header match 'value'" },
      { regex: /^transaction[\s_-]*amount$/i, confidence: 0.93, label: "header match 'transaction amount'" },
      { regex: /^price$/i, confidence: 0.80, label: "header match 'price'" },
      { regex: /^cost$/i, confidence: 0.78, label: "header match 'cost'" },
      { regex: /^fee$/i, confidence: 0.75, label: "header match 'fee'" },
      { regex: /^net$/i, confidence: 0.78, label: "header match 'net'" },
      { regex: /^gross$/i, confidence: 0.78, label: "header match 'gross'" },
      { regex: /^money$/i, confidence: 0.72, label: "header match 'money'" },
      { regex: /amount|amt|sum|total/i, confidence: 0.70, label: "catch-all partial match 'amount/amt/sum/total'" },
    ],
    contentValidator: (values) => {
      const parseable = values.filter((v) => v.trim() !== "").filter((v) => parseAmount(v) !== null);
      return parseable.length >= Math.ceil(values.filter((v) => v.trim() !== "").length * 0.5);
    },
  },
  {
    internalField: "debit",
    patterns: [
      { regex: /^debit$/i, confidence: 0.95, label: "exact header match 'debit'" },
      { regex: /withdrawal/i, confidence: 0.90, label: "header match 'withdrawal'" },
      { regex: /charge/i, confidence: 0.88, label: "header match 'charge'" },
      { regex: /payment/i, confidence: 0.85, label: "header match 'payment'" },
      { regex: /money[\s._-]*out/i, confidence: 0.90, label: "header match 'money out'" },
      { regex: /^dr$/i, confidence: 0.90, label: "header match 'dr'" },
      { regex: /^spend$/i, confidence: 0.85, label: "header match 'spend'" },
      { regex: /^expense$/i, confidence: 0.85, label: "header match 'expense'" },
      { regex: /^outflow$/i, confidence: 0.88, label: "header match 'outflow'" },
      { regex: /^paid$/i, confidence: 0.80, label: "header match 'paid'" },
      { regex: /^deducted$/i, confidence: 0.82, label: "header match 'deducted'" },
    ],
    contentValidator: (values) => {
      const parseable = values.filter((v) => v.trim() !== "").filter((v) => parseAmount(v) !== null);
      return parseable.length >= 1;
    },
  },
  {
    internalField: "credit",
    patterns: [
      { regex: /^credit$/i, confidence: 0.95, label: "exact header match 'credit'" },
      { regex: /deposit/i, confidence: 0.90, label: "header match 'deposit'" },
      { regex: /money[\s._-]*in/i, confidence: 0.90, label: "header match 'money in'" },
      { regex: /^cr$/i, confidence: 0.90, label: "header match 'cr'" },
      { regex: /^income$/i, confidence: 0.85, label: "header match 'income'" },
      { regex: /^received$/i, confidence: 0.82, label: "header match 'received'" },
      { regex: /^inflow$/i, confidence: 0.88, label: "header match 'inflow'" },
      { regex: /^refund$/i, confidence: 0.80, label: "header match 'refund'" },
      { regex: /^earned$/i, confidence: 0.80, label: "header match 'earned'" },
    ],
    contentValidator: (values) => {
      const parseable = values.filter((v) => v.trim() !== "").filter((v) => parseAmount(v) !== null);
      return parseable.length >= 1;
    },
  },
  {
    internalField: "category",
    patterns: [
      { regex: /^category$/i, confidence: 0.90, label: "exact header match 'category'" },
      { regex: /^cat$/i, confidence: 0.85, label: "header match 'cat'" },
      { regex: /^type$/i, confidence: 0.75, label: "header match 'type'" },
      { regex: /^class$/i, confidence: 0.85, label: "header match 'class'" },
      { regex: /^group$/i, confidence: 0.80, label: "header match 'group'" },
      { regex: /^tag$/i, confidence: 0.80, label: "header match 'tag'" },
      { regex: /^spending[\s_-]*category$/i, confidence: 0.90, label: "header match 'spending category'" },
      { regex: /^expense[\s_-]*type$/i, confidence: 0.88, label: "header match 'expense type'" },
      { regex: /^budget[\s_-]*category$/i, confidence: 0.88, label: "header match 'budget category'" },
      { regex: /^classification$/i, confidence: 0.82, label: "header match 'classification'" },
      { regex: /^sector$/i, confidence: 0.75, label: "header match 'sector'" },
    ],
    // Reject columns where values look like transaction types ("debit"/"credit")
    contentValidator: (values) => {
      const nonEmpty = values.filter((v) => v.trim() !== "");
      if (nonEmpty.length === 0) return false;
      const transTypeValues = nonEmpty.filter(
        (v) => /^(debit|credit|db|cr)$/i.test(v.trim())
      );
      // If >70% of values are just "debit"/"credit", this is not a category column
      return transTypeValues.length < nonEmpty.length * 0.7;
    },
  },
  {
    internalField: "account",
    patterns: [
      { regex: /^account$/i, confidence: 0.90, label: "exact header match 'account'" },
      { regex: /^acct$/i, confidence: 0.85, label: "header match 'acct'" },
      { regex: /^source$/i, confidence: 0.80, label: "header match 'source'" },
      { regex: /^bank$/i, confidence: 0.80, label: "header match 'bank'" },
      { regex: /account|acct/i, confidence: 0.75, label: "partial match 'account'" },
    ],
  },
  {
    internalField: "balance",
    patterns: [
      { regex: /^balance$/i, confidence: 0.95, label: "exact header match 'balance'" },
      { regex: /running/i, confidence: 0.85, label: "header match 'running'" },
      { regex: /closing/i, confidence: 0.85, label: "header match 'closing'" },
      { regex: /available/i, confidence: 0.85, label: "header match 'available'" },
      { regex: /balance/i, confidence: 0.85, label: "partial match 'balance'" },
    ],
    contentValidator: (values) => {
      const parseable = values.filter((v) => v.trim() !== "").filter((v) => parseAmount(v) !== null);
      return parseable.length >= Math.ceil(values.filter((v) => v.trim() !== "").length * 0.5);
    },
  },
  {
    internalField: "currency",
    patterns: [
      { regex: /^currency$/i, confidence: 0.95, label: "exact header match 'currency'" },
      { regex: /^curr$/i, confidence: 0.90, label: "header match 'curr'" },
      { regex: /^ccy$/i, confidence: 0.90, label: "header match 'ccy'" },
    ],
    contentValidator: (values) => {
      const nonEmpty = values.filter((v) => v.trim() !== "");
      if (nonEmpty.length === 0) return false;
      const currLike = nonEmpty.filter((v) => /^[A-Z]{3}$/i.test(v.trim()));
      return currLike.length >= Math.ceil(nonEmpty.length * 0.5);
    },
  },
];

/**
 * Infer how source columns map to internal NormalizedTransaction fields.
 *
 * Uses a priority-ordered set of header-name regex patterns combined with
 * optional content-level validation on sample rows. Produces a confidence
 * score and human-readable method string for each mapping.
 *
 * @param headers    - Lowercased, trimmed column headers from the source data.
 * @param sampleRows - A representative sample of rows (all rows is fine for small files).
 * @returns An object containing the `mappings` array and any `warnings` generated.
 */
export function inferSchema(
  headers: string[],
  sampleRows: Record<string, string>[]
): { mappings: FieldMapping[]; warnings: string[] } {
  const mappings: FieldMapping[] = [];
  const warnings: string[] = [];
  const mappedHeaders = new Set<string>();
  const mappedFields = new Set<string>();

  // Collect sample values for each header
  const sampleValues: Record<string, string[]> = {};
  for (const header of headers) {
    sampleValues[header] = sampleRows.map((row) => row[header] ?? "").slice(0, 20);
  }

  // --- Pass 1: Pattern-based matching ---
  for (const rule of FIELD_RULES) {
    if (mappedFields.has(rule.internalField)) continue;

    type Candidate = { header: string; confidence: number; label: string };
    let bestCandidate: Candidate | null = null;

    for (const header of headers) {
      if (mappedHeaders.has(header)) continue;

      for (const pattern of rule.patterns) {
        if (pattern.regex.test(header)) {
          let confidence = pattern.confidence;

          // Apply content validation if available (can lower confidence)
          if (rule.contentValidator) {
            const valid = rule.contentValidator(sampleValues[header]);
            if (!valid) {
              confidence *= 0.5;
            }
          }

          if (!bestCandidate || confidence > bestCandidate.confidence) {
            bestCandidate = { header, confidence, label: pattern.label };
          }
          break; // first matching pattern for this header wins
        }
      }
    }

    if (bestCandidate) {
      mappings.push({
        sourceColumn: bestCandidate.header,
        internalField: rule.internalField,
        confidence: round2(bestCandidate.confidence),
        method: bestCandidate.label,
      });
      mappedHeaders.add(bestCandidate.header);
      mappedFields.add(rule.internalField);
    }
  }

  // --- Pass 2: Content-only detection for date (if not already mapped) ---
  if (!mappedFields.has("date")) {
    for (const header of headers) {
      if (mappedHeaders.has(header)) continue;
      const values = sampleValues[header];
      const nonEmpty = values.filter((v) => v.trim() !== "");
      if (nonEmpty.length === 0) continue;
      const parseable = nonEmpty.filter((v) => parseDateFlex(v) !== null);
      if (parseable.length >= Math.ceil(nonEmpty.length * 0.6)) {
        mappings.push({
          sourceColumn: header,
          internalField: "date",
          confidence: 0.7,
          method: `content-only detection: ${parseable.length}/${nonEmpty.length} values parse as dates`,
        });
        mappedHeaders.add(header);
        mappedFields.add("date");
        warnings.push(
          `Column '${header}' mapped to date field with 70% confidence (content-only detection) -- verify format.`
        );
        break;
      }
    }
  }

  // --- Pass 3: Amount fallback ---
  // If both debit and credit found but no single amount -> use debit/credit mode (no extra action needed)
  // If neither amount nor debit/credit -> scan numeric columns for best candidate
  const hasAmount = mappedFields.has("amount");
  const hasDebit = mappedFields.has("debit");
  const hasCredit = mappedFields.has("credit");

  if (!hasAmount && !hasDebit && !hasCredit) {
    // Find the numeric column with the most variation
    let bestNumericHeader: string | null = null;
    let bestVariation = -1;

    for (const header of headers) {
      if (mappedHeaders.has(header)) continue;
      const values = sampleValues[header];
      const nums = values
        .map((v) => parseAmount(v))
        .filter((n): n is number => n !== null);
      if (nums.length < Math.ceil(values.filter((v) => v.trim() !== "").length * 0.5)) {
        continue;
      }
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const variation = max - min;
      if (variation > bestVariation) {
        bestVariation = variation;
        bestNumericHeader = header;
      }
    }

    if (bestNumericHeader) {
      mappings.push({
        sourceColumn: bestNumericHeader,
        internalField: "amount",
        confidence: 0.5,
        method: `fallback: selected most-varied numeric column '${bestNumericHeader}'`,
      });
      mappedHeaders.add(bestNumericHeader);
      mappedFields.add("amount");
      warnings.push(
        `No obvious amount/debit/credit column found. Column '${bestNumericHeader}' selected as amount with 50% confidence -- verify correctness.`
      );
    }
  }

  // --- Pass 4: Debit/credit mode resolution ---
  // If both debit and credit found but also a single amount, prefer single amount
  // (the debit/credit mappings stay for reference but normalization uses amount)
  if (hasDebit && hasCredit && hasAmount) {
    warnings.push(
      "Both debit/credit columns and a single amount column detected. Using single amount column for normalization."
    );
  }

  // --- Generate warnings for required fields ---
  const requiredFields = ["date", "description", "amount"];
  for (const field of requiredFields) {
    // amount is satisfied by debit+credit combo
    if (field === "amount" && (hasDebit || hasCredit)) continue;
    if (!mappedFields.has(field)) {
      warnings.push(
        `Required field '${field}' could not be mapped to any source column. Transactions may be incomplete.`
      );
    }
  }

  // --- Generate info warnings for mapped fields with <90% confidence ---
  for (const mapping of mappings) {
    if (mapping.confidence < 0.9 && mapping.confidence >= 0.5) {
      const pct = Math.round(mapping.confidence * 100);
      warnings.push(
        `Column '${mapping.sourceColumn}' mapped to ${mapping.internalField} field with ${pct}% confidence -- verify format.`
      );
    }
  }

  return { mappings, warnings };
}

// ------------------------------------------------------------
// 5. Flexible Date Parser
// ------------------------------------------------------------

/** Three-letter month abbreviation lookup. */
const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Attempt to parse a date string in numerous common financial formats.
 *
 * Tries the following formats in order:
 * 1. `YYYY-MM-DD` (ISO 8601)
 * 2. `MM/DD/YYYY`
 * 3. `DD/MM/YYYY` (only when day > 12, disambiguating from MM/DD)
 * 4. `MM-DD-YYYY`
 * 5. `DD-MMM-YYYY` (e.g., 01-Jan-2025)
 * 6. `MMM DD, YYYY` (e.g., Jan 01, 2025)
 * 7. `M/D/YY` (short year, assumes 2000s for YY < 70, 1900s otherwise)
 * 8. Fallback: `new Date(val)` validity check
 *
 * @param val - The raw date string to parse.
 * @returns ISO date string `YYYY-MM-DD` or `null` if unparseable.
 */
export function parseDateFlex(val: string): string | null {
  if (!val || val.trim() === "") return null;

  const s = val.trim();

  // 1. YYYY-MM-DD (ISO)
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    if (isValidDate(+y, +m, +d)) {
      return formatISO(+y, +m, +d);
    }
  }

  // 2. MM/DD/YYYY
  const slashMDY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMDY) {
    const [, m, d, y] = slashMDY;
    if (isValidDate(+y, +m, +d)) {
      return formatISO(+y, +m, +d);
    }
    // 3. DD/MM/YYYY -- only if day > 12 (first part can't be a month)
    if (+m > 12 && isValidDate(+y, +d, +m)) {
      return formatISO(+y, +d, +m);
    }
  }

  // 4. MM-DD-YYYY
  const dashMDY = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMDY) {
    const [, m, d, y] = dashMDY;
    if (isValidDate(+y, +m, +d)) {
      return formatISO(+y, +m, +d);
    }
  }

  // 5. DD-MMM-YYYY (e.g., 01-Jan-2025)
  const dMonY = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (dMonY) {
    const [, d, monthStr, y] = dMonY;
    const m = MONTH_ABBR[monthStr.toLowerCase()];
    if (m && isValidDate(+y, m, +d)) {
      return formatISO(+y, m, +d);
    }
  }

  // 6. MMM DD, YYYY (e.g., Jan 01, 2025)
  const monDY = s.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s*(\d{4})$/);
  if (monDY) {
    const [, monthStr, d, y] = monDY;
    const m = MONTH_ABBR[monthStr.toLowerCase()];
    if (m && isValidDate(+y, m, +d)) {
      return formatISO(+y, m, +d);
    }
  }

  // 7. M/D/YY (short year)
  const shortYear = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (shortYear) {
    const [, m, d, yy] = shortYear;
    const fullYear = +yy < 70 ? 2000 + +yy : 1900 + +yy;
    if (isValidDate(fullYear, +m, +d)) {
      return formatISO(fullYear, +m, +d);
    }
  }

  // 8. Fallback: new Date()
  try {
    const fallback = new Date(s);
    if (!isNaN(fallback.getTime())) {
      const y = fallback.getFullYear();
      const m = fallback.getMonth() + 1;
      const d = fallback.getDate();
      if (y > 1900 && y < 2100) {
        return formatISO(y, m, d);
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/** Check that a year/month/day triple forms a valid calendar date. */
function isValidDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (y < 1900 || y > 2100) return false;
  // Month length validation
  const daysInMonth = [0, 31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= daysInMonth[m];
}

/** Check for leap year. */
function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Format year, month, day as YYYY-MM-DD. */
function formatISO(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ------------------------------------------------------------
// 6. Amount Parser
// ------------------------------------------------------------

/**
 * Parse a financial amount string into a signed number.
 *
 * Handles:
 * - Currency symbols: `$`, `EUR`, `GBP`, `JPY` (strips them)
 * - Thousands separators: commas in `1,234.56`
 * - Parenthetical negatives: `(123.45)` becomes `-123.45`
 * - Explicit minus sign
 * - Whitespace
 *
 * @param val - The raw amount string.
 * @returns The parsed number, or `null` if unparseable.
 */
export function parseAmount(val: string): number | null {
  if (!val || val.trim() === "") return null;

  let s = val.trim();

  // Detect parenthetical negatives: (123.45) -> -123.45
  const parenMatch = s.match(/^\((.+)\)$/);
  let isNegFromParen = false;
  if (parenMatch) {
    s = parenMatch[1].trim();
    isNegFromParen = true;
  }

  // Strip currency symbols and codes
  s = s.replace(/^[\$\u20AC\u00A3\u00A5]/, ""); // $, EUR sign, GBP sign, JPY sign
  s = s.replace(/^(USD|EUR|GBP|JPY|CAD|AUD|CHF|INR)\s*/i, "");
  s = s.replace(/\s*(USD|EUR|GBP|JPY|CAD|AUD|CHF|INR)$/i, "");

  // Strip thousands separators (commas)
  s = s.replace(/,/g, "");

  // Strip any remaining whitespace
  s = s.trim();

  if (s === "" || s === "-" || s === "+") return null;

  const num = Number(s);
  if (isNaN(num)) return null;

  return isNegFromParen ? -Math.abs(num) : num;
}

// ------------------------------------------------------------
// 7. Category Inference (mirrors lib/parser.ts CATEGORY_RULES)
// ------------------------------------------------------------

/**
 * Category inference rules: ordered pairs of regex and category name.
 * Mirrors the CATEGORY_RULES from lib/parser.ts for consistency across
 * the application.
 */
const CATEGORY_RULES: [RegExp, string][] = [
  // ── Food Delivery (before dining so "uber eats" doesn't match generic "uber") ──
  [/doordash|uber\s*eats|grubhub|postmates|instacart|shipt|gopuff/i, "food_delivery"],

  // ── Housing / Rent ──
  [/rent|landlord|property\s*management|apartment|lease\s*payment|mortgage|housing/i, "housing"],

  // ── Utilities ──
  [/electric|power|gas\s*co|water|sewer|utility|utilities|trash|garbage|waste\s*management|recology/i, "utilities"],

  // ── Internet ──
  [/internet|comcast|spectrum|att\b|xfinity|centurylink|frontier\s*comm|cox\s*comm|hughesnet|starlink/i, "internet"],

  // ── Phone ──
  [/t-mobile|verizon|at&t|sprint|phone\s*bill|cricket|boost\s*mobile|mint\s*mobile|visible|us\s*cellular/i, "phone"],

  // ── Insurance ──
  [/insurance|geico|state\s*farm|progressive|allstate|liberty\s*mutual|nationwide|usaa|farmers|aetna|cigna|united\s*health|anthem|blue\s*cross|humana|metlife|prudential/i, "insurance"],

  // ── Medical ──
  [/medical|pharmacy|doctor|hospital|cvs|walgreens|urgent\s*care|clinic|dental|dentist|orthodont|optometr|ophthalmol|chiropractic|physical\s*therapy|quest\s*diagnostics|labcorp|kaiser|planned\s*parenthood|copay|deductible|health\s*care/i, "medical"],

  // ── Education ──
  [/tuition|university|college|school|udemy|coursera|chegg|textbook|student|pearson|mcgraw|blackboard|canvas\s*lms|learning\s*tree|khan\s*academy|edx|brilliant\.org|duolingo/i, "education"],

  // ── Childcare ──
  [/daycare|childcare|babysit|nanny|bright\s*horizons|kindercare|preschool|tutor(?!ial)|after\s*school/i, "childcare"],

  // ── Legal ──
  [/attorney|lawyer|legal\s*service|law\s*firm|notary|court\s*filing|legal\s*zoom|legal\s*shield/i, "legal"],

  // ── Government ──
  [/\birs\b|state\s*tax|property\s*tax|dmv|court\s*fee|fine\b|permit|license|passport|city\s*of|county\s*of|\.gov\b|government/i, "government"],

  // ── Charity ──
  [/donation|charity|nonprofit|non-profit|united\s*way|red\s*cross|salvation\s*army|gofundme|church|tithe|offering|habitat\s*for|goodwill/i, "charity"],

  // ── Savings / Investments ──
  [/savings\s*(?:account|deposit|transfer)|401k|401\(k\)|\bira\b|roth|investment|brokerage|fidelity|vanguard|schwab|e\s*trade|robinhood|acorns|betterment|wealthfront|webull|sofi\s*invest/i, "savings"],

  // ── Groceries (expanded) ──
  [/grocery|grocer|kroger|walmart\s*(?:supercenter|neighborhood)|aldi|h-?e-?b\b|publix|safeway|trader\s*joe|whole\s*foods|food\s*lion|giant\s*(?:food|eagle)|wegmans|sprouts|winco|piggly\s*wiggly|stop\s*(?:&|and)\s*shop|meijer|market\s*basket|harris\s*teeter|hannaford|food\s*city|ingles|bi-?lo|winn-?dixie|lidl|costco\s*wholesale\s*food|fresh\s*market|stater\s*bros|raleys|vons|albertsons|shoprite|food\s*4\s*less|save-?a-?lot/i, "groceries"],

  // ── Gas / Fuel ──
  [/gas\s*station|shell|chevron|exxon|bp\b|fuel|sunoco|marathon|valero|circle\s*k|wawa|speedway|racetrac|quiktrip|pilot|flying\s*j|casey|murphy\s*(?:oil|usa)/i, "gas"],

  // ── Fitness (separate category, not subscription) ──
  [/planet\s*fitness|gym\b|la\s*fitness|ymca|ywca|crossfit|peloton|equinox|orangetheory|orange\s*theory|anytime\s*fitness|24\s*hour\s*fitness|gold'?s?\s*gym|crunch\s*fitness|crunch\s*gym|barre|yoga|pilates|lifetime\s*fitness|snap\s*fitness|pure\s*barre|soul\s*cycle|f45\s*training/i, "fitness"],

  // ── Subscription / Streaming / Digital Services ──
  [/netflix|hulu|disney\s*\+|disney\s*plus|spotify|apple\s*music|youtube\s*(?:premium|tv)|hbo|paramount\s*\+|paramount\s*plus|peacock|amazon\s*prime|adobe|microsoft\s*365|office\s*365|google\s*(?:storage|one)|icloud|dropbox|dashlane|nordvpn|expressvpn|headspace|calm\s*app|calm\.com|audible|kindle\s*unlimited|skillshare|masterclass|curiosity\s*stream|crunchyroll|funimation|tidal|deezer|sirius|siriusxm|onlyfans|patreon|substack|apple\s*tv|discovery\s*\+|espn\s*\+|starz|showtime|britbox|mubi|criterion/i, "subscription"],

  // ── Dining / Restaurants (expanded, no food delivery) ──
  [/starbucks|coffee|mcdonald|restaurant|chipotle|wendy'?s|burger\s*king|taco\s*bell|subway|panera|chick-?fil-?a|popeyes|dunkin|domino'?s|pizza\s*hut|papa\s*john|olive\s*garden|applebee|chili'?s|ihop|denny'?s|waffle\s*house|panda\s*express|five\s*guys|shake\s*shack|in-?n-?out|jack\s*in\s*the\s*box|sonic\s*drive|arby'?s|kfc|wingstop|jimmy\s*john|jersey\s*mike|firehouse\s*sub|potbelly|noodles\s*(?:&|and)\s*co|cracker\s*barrel|outback|red\s*lobster|texas\s*roadhouse|buffalo\s*wild\s*wings|hooters|benihana|ruth'?s?\s*chris|capital\s*grille|cheesecake\s*factory|caf[eé]|bistro|diner|grill|pizzeria|bakery|bagel/i, "dining"],

  // ── Travel ──
  [/airline|airfare|hotel|airbnb|vrbo|booking\.com|expedia|delta\s*air|united\s*air|southwest\s*air|american\s*airlines|jetblue|frontier\s*air|spirit\s*air|marriott|hilton|hyatt|motel|resort|travelocity|kayak|priceline|tsa\b|orbitz|hotwire|trivago|wyndham|best\s*western|radisson|sheraton|westin|courtyard|hampton\s*inn|holiday\s*inn|la\s*quinta|embassy\s*suites|flights?|boarding\s*pass/i, "travel"],

  // ── Transportation (uber but NOT uber eats) ──
  [/uber(?!\s*eats)|lyft|taxi|cab\b|metro\s*card|subway|bus\s*pass|toll|parking|mta\b|bart\b|septa|cta\b|wmata|amtrak|greyhound|megabus|transit|ride\s*share|lime\s*scooter|bird\s*scooter|citibike/i, "transportation"],

  // ── Automotive ──
  [/auto\s*repair|mechanic|oil\s*change|tire\b|jiffy\s*lube|meineke|midas\b|autozone|o'?\s*reilly\s*auto|napa\s*auto|advance\s*auto|car\s*wash|smog|dmv\b|registration|valvoline|firestone|goodyear|discount\s*tire|pep\s*boys|maaco|safelite|aaa\b/i, "automotive"],

  // ── Pets ──
  [/petco|petsmart|vet(?:erinar)?|animal\s*hospital|pet\s*supplies|chewy\.com|chewy\b|bark\s*box|rover\.com|rover\s*pet|pet\s*food|doggy|grooming\s*pet/i, "pets"],

  // ── Clothing / Apparel ──
  [/nordstrom|macy'?s|old\s*navy|gap\b|zara\b|h&m\b|forever\s*21|tj\s*maxx|marshalls|ross\b|burlington|nike\b|adidas|foot\s*locker|asos\b|shein\b|fashion|uniqlo|banana\s*republic|express\b|american\s*eagle|hollister|abercrombie|lululemon|under\s*armour|puma\b|new\s*balance|skechers|dsw\b|famous\s*footwear/i, "clothing"],

  // ── Electronics ──
  [/best\s*buy|apple\s*store|micro\s*center|newegg|b&h\s*photo|samsung\s*store|gamestop|game\s*stop|fry'?s\s*electronics/i, "electronics"],

  // ── Home Improvement ──
  [/home\s*depot|lowe'?s|ace\s*hardware|menards|ikea|bed\s*bath|wayfair|pottery\s*barn|crate\s*(?:&|and)\s*barrel|restoration\s*hardware|home\s*goods|pier\s*1|williams\s*sonoma|west\s*elm|world\s*market|harbor\s*freight|true\s*value|sherwin|benjamin\s*moore/i, "home_improvement"],

  // ── Personal Care ──
  [/salon|barber|spa\b|nail\b|haircut|beauty|sephora|ulta|waxing|massage|dermatolog|cosmetic|skincare|great\s*clips|supercuts|floyd'?s|drybar|european\s*wax|hand\s*(?:&|and)\s*stone|bath\s*(?:&|and)\s*body/i, "personal_care"],

  // ── Alcohol / Bars ──
  [/\bbar\b|pub\b|tavern|brewery|liquor|wine\s*(?:shop|store|bar)|beer\b|spirits|total\s*wine|bevmo|abc\s*store|cocktail|nightclub|lounge/i, "alcohol"],

  // ── Entertainment ──
  [/cinema|movie|theater|theatre|ticketmaster|stubhub|bowling|arcade|amusement|zoo\b|museum|concert|live\s*nation|gaming|steam\b|playstation|xbox|nintendo|regal\s*cinema|amc\s*theat|cinemark|fandango|dave\s*(?:&|and)\s*buster|top\s*golf|escape\s*room|laser\s*tag|mini\s*golf|roller\s*coaster|theme\s*park|water\s*park|six\s*flags|cedar\s*point|seaworld/i, "entertainment"],

  // ── Shopping (general, after more specific retail categories) ──
  [/target|walmart|costco|amazon(?!\s*prime)|ebay|etsy|wish\.com|aliexpress|shein|wayfair|sam'?s\s*club|bj'?s\s*wholesale|dollar\s*(?:tree|general)|five\s*below|big\s*lots|overstock|mercari|poshmark|offerup|facebook\s*market/i, "shopping"],

  // ── Debt Payment ──
  [/visa\s*payment|mastercard\s*payment|min\s*payment|chase\s*(?:card|payment)|capital\s*one\s*(?:card|payment)|amex\s*(?:card|payment)|credit\s*card\s*payment|discover\s*(?:card|payment)|citi\s*(?:card|payment)|wells\s*fargo\s*(?:card|payment)/i, "debt_payment"],
  [/sofi\s*loan|lending|loan\s*payment|student\s*loan|navient|nelnet|fedloan|great\s*lakes|mohela|aidvantage/i, "debt_payment"],

  // ── Income ──
  [/direct\s*deposit|payroll|employer|paycheck|salary|wages|commission|bonus\s*pay|stipend|freelance\s*pay|ach\s*(?:credit|deposit)/i, "income"],

  // ── Transfer ──
  [/transfer|zelle|venmo|cashapp|cash\s*app|paypal\s*transfer|wire\s*transfer|ach\s*transfer|apple\s*cash|google\s*pay\s*transfer/i, "transfer"],
];

/**
 * Infer a spending category from a transaction description.
 *
 * Walks the `CATEGORY_RULES` array in order and returns the first match.
 * Falls back to `"uncategorized"` if nothing matches.
 *
 * @param desc - The transaction description to categorize.
 * @returns A category string.
 */
function inferCategory(desc: string): string {
  for (const [regex, cat] of CATEGORY_RULES) {
    if (regex.test(desc)) return cat;
  }
  return "uncategorized";
}

/**
 * Extract a best-effort merchant name from a transaction description.
 *
 * Applies common heuristics:
 * - Strips leading date-like fragments
 * - Strips trailing reference numbers
 * - Strips common prefixes like "POS", "ACH", "DEBIT", etc.
 * - Takes the first meaningful segment
 *
 * @param desc - The raw description string.
 * @returns A cleaned merchant name.
 */
function extractMerchant(desc: string): string {
  let s = desc.trim();

  // Strip common transaction prefixes
  s = s.replace(
    /^(POS\s+|ACH\s+|DEBIT\s+|CREDIT\s+|PURCHASE\s+|PAYMENT\s+|CHECKCARD\s+|RECURRING\s+|PREAUTHORIZED\s+|VISA\s+|MASTERCARD\s+|CHECK\s+)/i,
    ""
  );

  // Strip leading date fragments: "01/15 " or "2025-01-15 "
  s = s.replace(/^\d{1,2}\/\d{1,2}\s+/, "");
  s = s.replace(/^\d{4}-\d{2}-\d{2}\s+/, "");

  // Strip trailing reference/authorization numbers
  s = s.replace(/\s+#?\d{4,}$/g, "");
  s = s.replace(/\s+REF\s*#?\s*\w+$/i, "");
  s = s.replace(/\s+AUTH\s*#?\s*\w+$/i, "");

  // Strip trailing city/state patterns: "  CITY ST" or "  CITY, ST"
  s = s.replace(/\s{2,}[A-Z][a-zA-Z]+,?\s+[A-Z]{2}\s*$/, "");

  s = s.trim();

  // If still long, take the first meaningful segment (before long whitespace gaps or hashes)
  const segments = s.split(/\s{3,}/);
  if (segments.length > 1) {
    s = segments[0].trim();
  }

  return s || desc.trim();
}

// ------------------------------------------------------------
// Simple hash utility for generating transaction IDs
// ------------------------------------------------------------

/**
 * Compute a simple numeric hash from a string.
 * Not cryptographic -- just for generating stable, short transaction IDs.
 */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0; // Convert to 32-bit integer
  }
  // Return absolute value as hex, zero-padded to 8 chars
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/** Round a number to 2 decimal places. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ------------------------------------------------------------
// 8. Transaction Normalization
// ------------------------------------------------------------

/**
 * Transform raw parsed rows into `NormalizedTransaction[]` using the inferred field mappings.
 *
 * For each row:
 * - Maps source columns to internal fields via the provided mappings
 * - Applies `parseDateFlex` for date fields
 * - Applies `parseAmount` for amount/debit/credit fields
 * - Computes `amountSigned` (negative = spend) from either a single amount column or debit/credit pair
 * - Infers category from the description using `CATEGORY_RULES`
 * - Generates stable IDs in the form `txn_{index}_{hash}`
 * - Collects all unmapped source columns into `sourceMeta`
 *
 * @param headers  - The source column headers.
 * @param rows     - The source data rows.
 * @param mappings - The inferred field mappings from `inferSchema`.
 * @returns An object with the `transactions` array and any `warnings`.
 */
export function normalizeTransactions(
  headers: string[],
  rows: Record<string, string>[],
  mappings: FieldMapping[]
): { transactions: NormalizedTransaction[]; warnings: string[] } {
  const transactions: NormalizedTransaction[] = [];
  const warnings: string[] = [];

  // Build quick lookup: internalField -> sourceColumn
  const fieldToSource: Record<string, string> = {};
  for (const m of mappings) {
    fieldToSource[m.internalField] = m.sourceColumn;
  }

  // Determine the set of mapped source columns for sourceMeta exclusion
  const mappedSourceCols = new Set(mappings.map((m) => m.sourceColumn));

  // Determine amount mode
  const hasAmount = "amount" in fieldToSource;
  const hasDebit = "debit" in fieldToSource;
  const hasCredit = "credit" in fieldToSource;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // --- Date ---
    const rawDate = fieldToSource["date"] ? (row[fieldToSource["date"]] ?? "") : "";
    const dateISO = parseDateFlex(rawDate);
    if (!dateISO && rawDate.trim() !== "") {
      warnings.push(
        `Row ${i + 1}: Could not parse date '${rawDate}'. The transaction will use an empty date.`
      );
    }

    // --- Description ---
    const rawDesc = fieldToSource["description"]
      ? (row[fieldToSource["description"]] ?? "")
      : "";
    const description = rawDesc.trim();
    if (description === "") {
      warnings.push(`Row ${i + 1}: Missing description. The transaction will have an empty description.`);
    }

    // --- Amount ---
    let amountSigned: number | null = null;

    if (hasAmount) {
      const rawAmt = row[fieldToSource["amount"]] ?? "";
      amountSigned = parseAmount(rawAmt);
      if (amountSigned === null && rawAmt.trim() !== "") {
        warnings.push(
          `Row ${i + 1}: Could not parse amount '${rawAmt}'. The transaction will have amount 0.`
        );
      }
    } else if (hasDebit || hasCredit) {
      // Debit/credit mode: amountSigned = -debit + credit
      const rawDebit = hasDebit ? (row[fieldToSource["debit"]] ?? "") : "";
      const rawCredit = hasCredit ? (row[fieldToSource["credit"]] ?? "") : "";
      const debitVal = parseAmount(rawDebit) ?? 0;
      const creditVal = parseAmount(rawCredit) ?? 0;
      // debit is spending (negative), credit is income (positive)
      amountSigned = -Math.abs(debitVal) + Math.abs(creditVal);
    }

    if (amountSigned === null) {
      amountSigned = 0;
    }

    // --- Category ---
    const rawCategory = fieldToSource["category"]
      ? (row[fieldToSource["category"]] ?? "").trim()
      : "";
    const category = rawCategory !== ""
      ? rawCategory.toLowerCase()
      : inferCategory(description);

    // --- Account ---
    const account = fieldToSource["account"]
      ? (row[fieldToSource["account"]] ?? "").trim() || "default"
      : "default";

    // --- Balance ---
    const rawBalance = fieldToSource["balance"]
      ? (row[fieldToSource["balance"]] ?? "")
      : "";
    const balance = rawBalance.trim() !== "" ? parseAmount(rawBalance) : null;

    // --- Currency ---
    const rawCurrency = fieldToSource["currency"]
      ? (row[fieldToSource["currency"]] ?? "").trim()
      : "";
    const currency = rawCurrency !== "" && /^[A-Z]{3}$/i.test(rawCurrency)
      ? rawCurrency.toUpperCase()
      : "USD";

    // --- Merchant ---
    const merchant = extractMerchant(description);

    // --- Source Meta ---
    const sourceMeta: Record<string, string> = {};
    for (const header of headers) {
      if (!mappedSourceCols.has(header)) {
        sourceMeta[header] = row[header] ?? "";
      }
    }

    // --- ID ---
    const hashInput = `${dateISO ?? ""}|${description}|${amountSigned}`;
    const id = `txn_${i}_${simpleHash(hashInput)}`;

    transactions.push({
      id,
      dateISO: dateISO ?? "",
      description,
      merchant,
      amountSigned: round2(amountSigned),
      category,
      account,
      balance,
      currency,
      sourceMeta,
    });
  }

  return { transactions, warnings };
}

// ------------------------------------------------------------
// 9. Category Totals
// ------------------------------------------------------------

/**
 * Compute spending totals grouped by category.
 *
 * Only considers transactions with negative `amountSigned` (spending).
 * Returns absolute values (positive numbers representing spend amounts)
 * sorted by spend descending.
 *
 * @param txns - Array of normalized transactions.
 * @returns An object with `categoryTotals` (sorted map) and `totalSpend`.
 */
export function computeCategoryTotals(txns: NormalizedTransaction[]): {
  categoryTotals: Record<string, number>;
  totalSpend: number;
} {
  const totals: Record<string, number> = {};
  let totalSpend = 0;

  for (const txn of txns) {
    if (txn.amountSigned < 0) {
      const absAmount = Math.abs(txn.amountSigned);
      totalSpend += absAmount;
      totals[txn.category] = (totals[txn.category] ?? 0) + absAmount;
    }
  }

  // Sort by spend descending
  const sortedEntries = Object.entries(totals).sort(([, a], [, b]) => b - a);
  const categoryTotals: Record<string, number> = {};
  for (const [cat, val] of sortedEntries) {
    categoryTotals[cat] = round2(val);
  }

  return { categoryTotals, totalSpend: round2(totalSpend) };
}

// ------------------------------------------------------------
// 10. Main Entry Point
// ------------------------------------------------------------

/**
 * Normalize raw financial data from CSV or JSON into a uniform structure.
 *
 * This is the main entry point that chains the entire pipeline:
 * 1. **Parse** the raw content (CSV or JSON) into headers + rows
 * 2. **Infer** column-to-field mappings using heuristic rules
 * 3. **Normalize** each row into a `NormalizedTransaction`
 * 4. **Compute** category totals and total spend
 * 5. **Return** the full `NormalizationResult`
 *
 * @param rawContent - The raw file content as a string.
 * @param fileType   - Either `"csv"` or `"json"`.
 * @returns A complete `NormalizationResult` with transactions, warnings, schema map, and totals.
 *
 * @example
 * ```ts
 * const csv = `Date,Description,Amount\n2025-01-15,Starbucks,-4.50\n2025-01-16,Payroll,2500.00`;
 * const result = normalizeFinancialData(csv, "csv");
 * console.log(result.normalizedTransactions.length); // 2
 * console.log(result.totalSpend); // 4.5
 * ```
 */
export function normalizeFinancialData(
  rawContent: string,
  fileType: "csv" | "json"
): NormalizationResult {
  const allWarnings: string[] = [];

  // --- Step 1: Parse ---
  let parsed: ParsedRaw;

  if (fileType === "csv") {
    parsed = parseCSVRaw(rawContent);
  } else {
    parsed = parseJSONRaw(rawContent);
  }

  if (parsed.headers.length === 0) {
    allWarnings.push("No headers detected in the input. Returning empty result.");
    return {
      normalizedTransactions: [],
      warnings: allWarnings,
      schemaMap: [],
      categoryTotals: {},
      totalSpend: 0,
    };
  }

  if (parsed.rows.length === 0) {
    allWarnings.push("Input contains headers but no data rows. Returning empty result.");
    return {
      normalizedTransactions: [],
      warnings: allWarnings,
      schemaMap: [],
      categoryTotals: {},
      totalSpend: 0,
    };
  }

  // --- Step 2: Infer Schema ---
  const { mappings, warnings: schemaWarnings } = inferSchema(parsed.headers, parsed.rows);
  allWarnings.push(...schemaWarnings);

  // --- Step 3: Normalize Transactions ---
  const { transactions, warnings: normWarnings } = normalizeTransactions(
    parsed.headers,
    parsed.rows,
    mappings
  );
  allWarnings.push(...normWarnings);

  // --- Step 4: Compute Category Totals ---
  const { categoryTotals, totalSpend } = computeCategoryTotals(transactions);

  // --- Step 5: Return ---
  return {
    normalizedTransactions: transactions,
    warnings: allWarnings,
    schemaMap: mappings,
    categoryTotals,
    totalSpend,
  };
}
