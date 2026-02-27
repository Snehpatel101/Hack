// ============================================================
// Equity Finance Copilot — POST /api/chat
// Chatbot endpoint: watsonx.ai -> OpenAI -> rule-based fallback
// ============================================================
import { NextRequest, NextResponse } from "next/server";

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatRequestBody {
  message: string;
  history: ChatMessage[];
  context: {
    snapshot?: Record<string, unknown> | null;
    plan?: Record<string, unknown> | null;
  };
}

// System prompt for the financial coach chatbot
function buildSystemPrompt(context: ChatRequestBody["context"]): string {
  let systemPrompt = `You are the Equity Finance Copilot assistant — a warm, knowledgeable, and encouraging financial coach.

Your role:
- Help users understand their financial plan, risks, and next steps
- Explain financial concepts in simple, everyday language
- Be supportive and non-judgmental — never shame users for their financial situation
- Provide educational guidance, NOT professional financial advice
- Keep responses concise (2-4 sentences for simple questions, up to a short paragraph for complex ones)
- Use specific numbers from the user's financial data when available
- Always end with an actionable suggestion or encouraging note

Safety guardrails:
- Never recommend specific financial products, stocks, or investments
- Always include a brief reminder that this is educational coaching, not financial advice, when giving detailed guidance
- If someone expresses financial distress, be empathetic and suggest they speak with a qualified financial advisor or counselor
- Do not make promises about outcomes — use phrases like "this could help" or "many people find"
`;

  if (context?.snapshot) {
    systemPrompt += `\nThe user's current financial snapshot:\n${JSON.stringify(context.snapshot, null, 2)}\n`;
  }

  if (context?.plan) {
    systemPrompt += `\nThe user's current weekly action plan:\n${JSON.stringify(context.plan, null, 2)}\n`;
  }

  return systemPrompt;
}

// ---- watsonx.ai integration ----
async function callWatsonx(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string
): Promise<string | null> {
  const apiKey = process.env.WATSONX_API_KEY;
  const projectId = process.env.WATSONX_PROJECT_ID;

  if (!apiKey || !projectId) return null;

  const watsonxUrl =
    process.env.WATSONX_URL ||
    "https://us-south.ml.cloud.ibm.com/ml/v1/text/generation?version=2024-05-31";

  // Build a single prompt string for watsonx text generation
  let prompt = `<|system|>\n${systemPrompt}\n<|end|>\n`;
  for (const msg of history) {
    const role = msg.role === "user" ? "user" : "assistant";
    prompt += `<|${role}|>\n${msg.content}\n<|end|>\n`;
  }
  prompt += `<|user|>\n${userMessage}\n<|end|>\n<|assistant|>\n`;

  try {
    const response = await fetch(watsonxUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model_id: process.env.WATSONX_MODEL_ID || "ibm/granite-3-8b-instruct",
        input: prompt,
        parameters: {
          max_new_tokens: 500,
          temperature: 0.3,
        },
        project_id: projectId,
      }),
    });

    if (!response.ok) {
      console.error(
        "[chat] watsonx.ai API error:",
        response.status,
        await response.text().catch(() => "")
      );
      return null;
    }

    const data = await response.json();
    const generatedText =
      data?.results?.[0]?.generated_text || data?.generated_text;

    if (generatedText && typeof generatedText === "string") {
      return generatedText.trim();
    }

    console.warn("[chat] watsonx.ai returned empty response");
    return null;
  } catch (err) {
    console.error("[chat] watsonx.ai call failed:", err);
    return null;
  }
}

// ---- OpenAI fallback ----
async function callOpenAI(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    for (const msg of history) {
      messages.push({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      });
    }

    messages.push({ role: "user", content: userMessage });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 500,
      messages,
    });

    const content = completion.choices[0]?.message?.content;
    return content?.trim() || null;
  } catch (err) {
    console.error("[chat] OpenAI call failed:", err);
    return null;
  }
}

// ---- Rule-based fallback ----
function ruleBasedResponse(
  message: string,
  context: ChatRequestBody["context"]
): string {
  const lower = message.toLowerCase();
  const snapshot = context?.snapshot as Record<string, unknown> | null;
  const plan = context?.plan as Record<string, unknown> | null;

  // Overdraft / risk windows
  if (lower.includes("overdraft") || lower.includes("risk window") || lower.includes("balance risk")) {
    const riskWindows = (snapshot?.risk_windows as Array<Record<string, unknown>>) || [];
    if (riskWindows.length > 0) {
      const critical = riskWindows.filter(
        (w) => w.risk_level === "critical" || w.risk_level === "high"
      );
      if (critical.length > 0) {
        const descriptions = critical
          .slice(0, 3)
          .map((w) => `  - ${w.date}: ${w.description} (${w.risk_level}). Suggestion: ${w.suggestion}`)
          .join("\n");
        return `Based on your data, you have ${critical.length} high-risk window(s) where your balance could dip dangerously low:\n\n${descriptions}\n\nThe key is to time your spending around these dates. Consider moving a non-essential payment to after your next paycheck arrives. Even shifting one bill by a few days can make a big difference!`;
      }
    }
    return "Good news — based on your current data, you don't have any critical overdraft risk windows right now. Keep monitoring your balance around bill due dates to stay ahead. Setting up low-balance alerts at your bank is a great safety net!";
  }

  // Subscriptions / cancel
  if (lower.includes("subscription") || lower.includes("cancel") || lower.includes("streaming")) {
    const leaks = (snapshot?.subscription_leaks as Array<Record<string, unknown>>) || [];
    const subs = (snapshot?.subscriptions as Array<Record<string, unknown>>) || [];
    if (leaks.length > 0) {
      const leakList = leaks
        .slice(0, 5)
        .map((s) => `  - ${s.name}: $${s.amount}/mo — ${s.leak_reason || "potential savings opportunity"}`)
        .join("\n");
      const totalLeak = leaks.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      return `I found ${leaks.length} subscription(s) that might be worth reviewing:\n\n${leakList}\n\nThat's potentially $${totalLeak.toFixed(2)}/month you could redirect toward your goals. You don't have to cancel everything at once — start with the one you use least and see how it feels for a month.`;
    }
    if (subs.length > 0) {
      return `You have ${subs.length} active subscription(s) totaling about $${(snapshot?.monthly_spending as Record<string, number>)?.subscriptions || "?"}/month. None are flagged as obvious leaks, but it's always worth reviewing them periodically. Ask yourself: "Did I use this in the last 2 weeks?" If not, it might be worth pausing.`;
    }
    return "I don't have detailed subscription data in your current snapshot, but a good rule of thumb is to review all recurring charges monthly. Look at your bank statement for any charges under $20 — those small ones add up fast!";
  }

  // Avalanche vs snowball
  if (lower.includes("avalanche") || lower.includes("snowball")) {
    const debts = (snapshot?.debts as Array<Record<string, unknown>>) || [];
    let debtContext = "";
    if (debts.length > 0) {
      const highestApr = [...debts].sort((a, b) => Number(b.apr) - Number(a.apr))[0];
      const lowestBal = [...debts].sort((a, b) => Number(a.balance) - Number(b.balance))[0];
      debtContext = `\n\nWith your debts, the avalanche method would target "${highestApr.name}" first (${highestApr.apr}% APR) to save the most on interest. The snowball method would target "${lowestBal.name}" first ($${lowestBal.balance} balance) for a quick psychological win.`;
    }
    return `Great question! These are two popular debt payoff strategies:\n\n**Avalanche Method:** Pay minimums on everything, then throw extra money at the debt with the highest interest rate. This saves you the most money over time.\n\n**Snowball Method:** Pay minimums on everything, then throw extra money at the smallest balance first. This gives you quick wins that build motivation.${debtContext}\n\nBoth work — the best method is the one you'll stick with. Many financial coaches recommend snowball if you need motivation, and avalanche if you're disciplined and want to minimize interest paid.`;
  }

  // Save / emergency fund
  if (lower.includes("save") || lower.includes("emergency") || lower.includes("savings") || lower.includes("rainy day")) {
    const freeCash = Number(snapshot?.free_cash_monthly) || 0;
    let suggestion = "";
    if (freeCash > 0) {
      const microSave = Math.min(freeCash * 0.1, 25);
      suggestion = `\n\nBased on your free cash of $${freeCash.toFixed(0)}/month, you could start by automatically saving $${microSave.toFixed(0)}/week into a separate savings account. That's $${(microSave * 4).toFixed(0)}/month — small, but it adds up to $${(microSave * 52).toFixed(0)} in a year!`;
    }
    return `Building an emergency fund is one of the most powerful financial moves you can make. The goal is to eventually have 3-6 months of expenses saved, but don't let that big number discourage you — start micro.\n\n**The Micro Emergency Fund Strategy:**\n1. Open a separate savings account (so the money isn't "visible" in your checking)\n2. Set up an automatic weekly transfer — even $5-10 makes a difference\n3. Treat it like a bill you pay to yourself\n4. First milestone: $500 (covers most common emergencies)${suggestion}\n\nEvery dollar you save is a dollar of stress you remove from your life.`;
  }

  // Debt general
  if (lower.includes("debt") || lower.includes("owe") || lower.includes("loan") || lower.includes("credit card")) {
    const debts = (snapshot?.debts as Array<Record<string, unknown>>) || [];
    if (debts.length > 0) {
      const totalDebt = debts.reduce((sum, d) => sum + (Number(d.balance) || 0), 0);
      const totalMin = debts.reduce((sum, d) => sum + (Number(d.minimum_payment) || 0), 0);
      const debtList = debts
        .slice(0, 5)
        .map((d) => `  - ${d.name}: $${d.balance} at ${d.apr}% APR (min payment: $${d.minimum_payment})`)
        .join("\n");
      return `Here's your current debt picture:\n\n${debtList}\n\n**Total:** $${totalDebt.toFixed(2)} across ${debts.length} account(s)\n**Total minimum payments:** $${totalMin.toFixed(2)}/month\n\nThe most important thing is to never miss minimum payments — that protects your credit and avoids late fees. If you have any extra cash after essentials, even $10-20 extra on your highest-interest debt can save you money over time. You're already taking the right step by looking at this!`;
    }
    return "I don't see detailed debt information in your current snapshot. If you have debts, the most important first step is to list them all out with their balances, interest rates, and minimum payments. Knowledge is power when it comes to debt payoff!";
  }

  // Plan / actions / what should I do
  if (lower.includes("plan") || lower.includes("action") || lower.includes("what should") || lower.includes("next step")) {
    const summary = (plan as Record<string, unknown>)?.summary;
    if (summary) {
      return `${summary}\n\nWould you like me to explain any specific action in your plan, or help you understand your overdraft risk, subscriptions, or debt payoff strategies?`;
    }
    return "Your personalized plan is displayed above. It's organized into Week 1 (most urgent), Week 2 (important), and Ongoing actions. Start with the Week 1 items — they'll have the biggest immediate impact. Would you like me to explain any part of it?";
  }

  // Default
  return "I can help you understand your financial plan! Here are some things you can ask me about:\n\n- **Overdraft risk** — when your balance might dip too low\n- **Subscriptions** — which recurring charges might be worth cutting\n- **Debt strategies** — avalanche vs snowball payoff methods\n- **Saving tips** — how to build an emergency fund\n- **Your plan** — what actions to take and why\n\nWhat would you like to know more about?";
}

// ---- Main handler ----
export async function POST(request: NextRequest) {
  try {
    const body: ChatRequestBody = await request.json();
    const { message, history = [], context = {} } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    const systemPrompt = buildSystemPrompt(context);

    // Try watsonx.ai first
    let reply = await callWatsonx(systemPrompt, history, message);

    // Fallback to OpenAI
    if (!reply) {
      reply = await callOpenAI(systemPrompt, history, message);
    }

    // Fallback to rule-based
    if (!reply) {
      reply = ruleBasedResponse(message, context);
    }

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[chat] Unexpected error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
