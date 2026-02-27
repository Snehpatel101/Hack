// ============================================================
// Equity Finance Copilot — POST /api/parse-upload
// Accepts FormData with a CSV or JSON file, returns parsed transactions.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { RawTransaction } from "@/lib/types";
import { parseCSV } from "@/lib/parser";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing required field: 'file'. Upload a CSV or JSON file." },
        { status: 400 }
      );
    }

    // Read file contents
    const text = await file.text();

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Uploaded file is empty." },
        { status: 400 }
      );
    }

    // Determine file type from name or content
    const fileName = file.name.toLowerCase();
    let fileType: "csv" | "json";
    let transactions: RawTransaction[];

    if (fileName.endsWith(".csv")) {
      fileType = "csv";
    } else if (fileName.endsWith(".json")) {
      fileType = "json";
    } else {
      // Attempt to detect by content: if it starts with [ or { assume JSON
      const trimmed = text.trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        fileType = "json";
      } else {
        fileType = "csv";
      }
    }

    if (fileType === "csv") {
      try {
        transactions = parseCSV(text);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to parse CSV.";
        return NextResponse.json({ error: message }, { status: 422 });
      }
    } else {
      // JSON parsing
      try {
        const parsed = JSON.parse(text);

        // Accept either a top-level array of transactions or an object
        // with a "transactions" key
        if (Array.isArray(parsed)) {
          transactions = parsed as RawTransaction[];
        } else if (parsed && Array.isArray(parsed.transactions)) {
          transactions = parsed.transactions as RawTransaction[];
        } else {
          return NextResponse.json(
            {
              error:
                "JSON must be an array of transactions or an object with a 'transactions' array.",
            },
            { status: 422 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON in uploaded file." },
          { status: 422 }
        );
      }
    }

    // Validate that we got at least some transactions
    if (transactions.length === 0) {
      return NextResponse.json(
        { error: "No valid transactions found in the uploaded file." },
        { status: 422 }
      );
    }

    // Optionally parse the profile field (JSON string with additional context)
    let profile: {
      checking_balance?: number;
      income?: unknown;
      debts?: unknown;
      goal?: string;
    } | null = null;

    const profileField = formData.get("profile");
    if (profileField && typeof profileField === "string") {
      try {
        profile = JSON.parse(profileField);
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON in 'profile' field." },
          { status: 422 }
        );
      }
    }

    return NextResponse.json({
      transactions,
      fileType,
      ...(profile ? { profile } : {}),
    });
  } catch (err: unknown) {
    console.error("[parse-upload] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error while parsing upload." },
      { status: 500 }
    );
  }
}
