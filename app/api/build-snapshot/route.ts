// ============================================================
// Equity Finance Copilot — POST /api/build-snapshot
// Accepts transactions + profile data, returns a FinancialSnapshot.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { RawTransaction, RawIncome, RawDebt, UploadPayload } from "@/lib/types";
import { buildSnapshot } from "@/lib/parser";

interface BuildSnapshotBody {
  transactions: RawTransaction[];
  income?: RawIncome[];
  debts?: RawDebt[];
  checking_balance?: number;
  goal?: "stability" | "debt" | "emergency" | "auto";
}

export async function POST(request: NextRequest) {
  try {
    let body: BuildSnapshotBody;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      );
    }

    // Validate required field
    if (!body.transactions || !Array.isArray(body.transactions)) {
      return NextResponse.json(
        { error: "Missing or invalid 'transactions' array in request body." },
        { status: 400 }
      );
    }

    if (body.transactions.length === 0) {
      return NextResponse.json(
        { error: "Transactions array must not be empty." },
        { status: 400 }
      );
    }

    // Build the payload for the parser
    const payload: UploadPayload = {
      transactions: body.transactions,
      income: body.income,
      debts: body.debts,
      checking_balance: body.checking_balance,
      goal: body.goal || "auto",
    };

    const snapshot = buildSnapshot(payload);

    return NextResponse.json(snapshot);
  } catch (err: unknown) {
    console.error("[build-snapshot] Unexpected error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: `Failed to build snapshot: ${message}` },
      { status: 500 }
    );
  }
}
