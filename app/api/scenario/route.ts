// ============================================================
// Equity Finance Copilot — POST /api/scenario
// Scenario Simulator: parse any CSV/JSON file into normalized
// transactions so the client can run what-if scenarios.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { normalizeFinancialData } from "@/lib/normalizer";

/** The set of supported scenario types. */
const VALID_SCENARIOS = [
  "rent_spike",
  "medical_emergency",
  "job_loss",
  "car_repair",
] as const;

type Scenario = (typeof VALID_SCENARIOS)[number];

/** The set of supported timeframes (in days). */
const VALID_TIMEFRAMES = [30, 60, 90] as const;

export async function POST(request: NextRequest) {
  try {
    // --------------------------------------------------------
    // 1. Parse FormData
    // --------------------------------------------------------
    const formData = await request.formData();

    const file = formData.get("file");
    const scenarioField = formData.get("scenario");
    const timeframeField = formData.get("timeframe");

    // --- Validate required fields ---
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing required field: 'file'. Upload a CSV or JSON file." },
        { status: 400 }
      );
    }

    if (!scenarioField || typeof scenarioField !== "string") {
      return NextResponse.json(
        { error: "Missing required field: 'scenario'." },
        { status: 400 }
      );
    }

    if (!timeframeField) {
      return NextResponse.json(
        { error: "Missing required field: 'timeframe'." },
        { status: 400 }
      );
    }

    // --- Validate scenario ---
    const scenario = scenarioField as string;
    if (!VALID_SCENARIOS.includes(scenario as Scenario)) {
      return NextResponse.json(
        {
          error: `Invalid scenario '${scenario}'. Must be one of: ${VALID_SCENARIOS.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    // --- Validate timeframe ---
    const timeframe = Number(timeframeField);
    if (isNaN(timeframe) || !VALID_TIMEFRAMES.includes(timeframe as 30 | 60 | 90)) {
      return NextResponse.json(
        {
          error: `Invalid timeframe '${timeframeField}'. Must be one of: ${VALID_TIMEFRAMES.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------------
    // 2. Read and detect file type
    // --------------------------------------------------------
    const text = await file.text();

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Uploaded file is empty." },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    let fileType: "csv" | "json";

    if (fileName.endsWith(".csv")) {
      fileType = "csv";
    } else if (fileName.endsWith(".json")) {
      fileType = "json";
    } else {
      // Sniff content to determine type
      const trimmed = text.trim();
      fileType =
        trimmed.startsWith("[") || trimmed.startsWith("{") ? "json" : "csv";
    }

    // --------------------------------------------------------
    // 3. Normalize with the universal normalizer
    // --------------------------------------------------------
    let normResult;
    try {
      normResult = normalizeFinancialData(text, fileType);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to parse file.";
      return NextResponse.json(
        { error: `Could not parse file: ${message}` },
        { status: 422 }
      );
    }

    if (normResult.normalizedTransactions.length === 0) {
      return NextResponse.json(
        { error: "No valid transactions found in the uploaded file." },
        { status: 422 }
      );
    }

    // --------------------------------------------------------
    // 4. Build response
    // --------------------------------------------------------
    const transactions = normResult.normalizedTransactions.map((txn) => ({
      date: txn.dateISO,
      description: txn.description,
      amount: txn.amountSigned,
      category: txn.category,
    }));

    return NextResponse.json({
      transactions,
      normalizer: {
        schemaMap: normResult.schemaMap.map((m) => ({
          sourceColumn: m.sourceColumn,
          internalField: m.internalField,
          confidence: m.confidence,
          method: m.method,
        })),
        warnings: normResult.warnings,
        categoryTotals: normResult.categoryTotals,
        totalSpend: normResult.totalSpend,
        transactionCount: normResult.normalizedTransactions.length,
      },
      scenario,
      timeframe,
    });
  } catch (err: unknown) {
    console.error("[scenario] Unexpected error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: `Scenario parsing failed: ${message}` },
      { status: 500 }
    );
  }
}
