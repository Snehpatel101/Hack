// ============================================================
// Equity Finance Copilot — POST /api/climate
// Climate Wallet: parse any CSV/JSON financial file into
// normalized transactions. Footprint computation happens
// client-side in the component.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { normalizeFinancialData } from "@/lib/normalizer";

export async function POST(request: NextRequest) {
  try {
    // ----------------------------------------------------------
    // 1. Extract file from FormData
    // ----------------------------------------------------------
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing required field: 'file'. Upload a CSV or JSON file." },
        { status: 400 }
      );
    }

    const text = await file.text();

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Uploaded file is empty." },
        { status: 400 }
      );
    }

    // ----------------------------------------------------------
    // 2. Detect file type from extension or content
    // ----------------------------------------------------------
    const fileName = file.name.toLowerCase();
    let fileType: "csv" | "json";

    if (fileName.endsWith(".csv")) {
      fileType = "csv";
    } else if (fileName.endsWith(".json")) {
      fileType = "json";
    } else {
      const trimmed = text.trim();
      fileType =
        trimmed.startsWith("[") || trimmed.startsWith("{") ? "json" : "csv";
    }

    // ----------------------------------------------------------
    // 3. Normalize with the universal normalizer
    // ----------------------------------------------------------
    let normResult;
    try {
      normResult = normalizeFinancialData(text, fileType);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to parse file.";
      return NextResponse.json(
        { error: `Parse error: ${message}` },
        { status: 422 }
      );
    }

    if (normResult.normalizedTransactions.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid transactions found in the uploaded file. " +
            (normResult.warnings.length > 0
              ? normResult.warnings.join(" ")
              : "Check that the file contains transaction data."),
        },
        { status: 422 }
      );
    }

    // ----------------------------------------------------------
    // 4. Shape transactions for the client
    // ----------------------------------------------------------
    const transactions = normResult.normalizedTransactions.map((txn) => ({
      date: txn.dateISO,
      description: txn.description,
      amount: txn.amountSigned,
      category: txn.category,
    }));

    // ----------------------------------------------------------
    // 5. Return response
    // ----------------------------------------------------------
    return NextResponse.json({
      transactions,
      normalizer: {
        schemaMap: normResult.schemaMap,
        warnings: normResult.warnings,
        categoryTotals: normResult.categoryTotals,
        totalSpend: normResult.totalSpend,
        transactionCount: normResult.normalizedTransactions.length,
      },
    });
  } catch (err: unknown) {
    console.error("[climate] Unexpected error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: `Climate parsing failed: ${message}` },
      { status: 500 }
    );
  }
}
