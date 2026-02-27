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

/** Helper to extract a quick financial summary from the snapshot for context-rich responses */
function getFinancialSummary(snapshot: Record<string, unknown> | null): string {
  if (!snapshot) return "";

  const parts: string[] = [];
  const balance = Number(snapshot.checking_balance);
  const income = Number(snapshot.monthly_income);
  const freeCash = Number(snapshot.free_cash_monthly);
  const spending = snapshot.monthly_spending as Record<string, number> | undefined;
  const debts = (snapshot.debts as Array<Record<string, unknown>>) || [];

  if (!isNaN(balance) && balance > 0) parts.push(`checking balance of $${balance.toFixed(0)}`);
  if (!isNaN(income) && income > 0) parts.push(`monthly income of $${income.toFixed(0)}`);
  if (spending) {
    const total = (spending.essentials || 0) + (spending.discretionary || 0) +
      (spending.debt_payments || 0) + (spending.subscriptions || 0);
    if (total > 0) parts.push(`total monthly spending of $${total.toFixed(0)}`);
  }
  if (!isNaN(freeCash)) parts.push(`free cash of $${freeCash.toFixed(0)}/month`);
  if (debts.length > 0) {
    const totalDebt = debts.reduce((sum, d) => sum + (Number(d.balance) || 0), 0);
    parts.push(`$${totalDebt.toFixed(0)} in total debt across ${debts.length} account(s)`);
  }

  return parts.length > 0 ? `Based on your data, you have a ${parts.join(", ")}.` : "";
}

function ruleBasedResponse(
  message: string,
  context: ChatRequestBody["context"]
): string {
  const lower = message.toLowerCase().trim();
  const snapshot = context?.snapshot as Record<string, unknown> | null;
  const plan = context?.plan as Record<string, unknown> | null;

  // Greetings / hello / hi
  if (/^(hi|hello|hey|howdy|good\s*(morning|afternoon|evening)|what'?s?\s*up|yo)\b/i.test(lower)) {
    const summary = getFinancialSummary(snapshot);
    const greeting = summary
      ? `Hi there! I am your financial copilot. ${summary}\n\nI can help you understand your financial plan, risks, and next steps. What would you like to know?`
      : "Hi there! I am your financial copilot. I can help you understand your financial plan, explain risks, and answer questions about your finances. What would you like to know?";
    return greeting;
  }

  // Thank you / thanks
  if (/^(thank|thanks|thx|ty|appreciate)/i.test(lower)) {
    return "You're welcome! Remember, every small step counts. Is there anything else about your finances I can help explain?";
  }

  // Overdraft / risk windows
  if (lower.includes("overdraft") || lower.includes("risk window") || lower.includes("balance risk") || lower.includes("going negative") || lower.includes("run out of money")) {
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
      const mediumRisks = riskWindows.filter((w) => w.risk_level === "medium");
      if (mediumRisks.length > 0) {
        const descriptions = mediumRisks
          .slice(0, 3)
          .map((w) => `  - ${w.date}: ${w.description} (${w.risk_level})`)
          .join("\n");
        return `You don't have any critical risk windows, but there are ${mediumRisks.length} medium-risk period(s) to watch:\n\n${descriptions}\n\nKeep an eye on your balance around these dates and try to avoid extra spending just before them.`;
      }
    }
    return "Good news — based on your current data, you don't have any critical overdraft risk windows right now. Keep monitoring your balance around bill due dates to stay ahead. Setting up low-balance alerts at your bank is a great safety net!";
  }

  // Balance / checking / how much do I have
  if (lower.includes("balance") || lower.includes("checking") || lower.includes("how much do i have") || lower.includes("how much money")) {
    const balance = Number(snapshot?.checking_balance);
    const freeCash = Number(snapshot?.free_cash_monthly);
    if (!isNaN(balance) && balance > 0) {
      let response = `Your current checking balance is $${balance.toFixed(0)}.`;
      if (!isNaN(freeCash)) {
        if (freeCash > 0) {
          response += ` After accounting for all your monthly expenses and debt payments, you have about $${freeCash.toFixed(0)}/month in free cash.`;
        } else {
          response += ` Your monthly expenses currently exceed your income by about $${Math.abs(freeCash).toFixed(0)}, which means your balance will trend downward. Let's look at ways to close that gap.`;
        }
      }
      if (balance < 200) {
        response += "\n\nYour balance is on the low side — be extra careful with spending over the next few days, especially before your next paycheck.";
      }
      return response;
    }
    return "I don't have your current balance information. If you entered it during setup, it should appear in your financial snapshot above. You can also check your bank app for the most up-to-date number.";
  }

  // Income / paycheck / salary
  if (lower.includes("income") || lower.includes("paycheck") || lower.includes("salary") || lower.includes("how much do i make") || lower.includes("how much do i earn") || lower.includes("pay")) {
    const income = Number(snapshot?.monthly_income);
    const incomeSchedule = (snapshot?.income_schedule as Array<Record<string, unknown>>) || [];
    if (!isNaN(income) && income > 0) {
      let response = `Your estimated monthly income is $${income.toFixed(0)}.`;
      if (incomeSchedule.length > 0) {
        const details = incomeSchedule
          .map((inc) => `  - ${inc.source}: $${Number(inc.amount).toFixed(0)} (${inc.frequency})`)
          .join("\n");
        response += `\n\nHere's the breakdown:\n${details}`;
      }
      return response + "\n\nKnowing exactly when your money comes in helps you plan bill payments around those dates to avoid low-balance periods.";
    }
    return "I don't have detailed income information for your profile. If you have regular paychecks, entering them during setup helps us detect overdraft risks more accurately.";
  }

  // Spending / expenses / where does my money go
  if (lower.includes("spending") || lower.includes("expenses") || lower.includes("where does my money") || lower.includes("spend") || lower.includes("budget")) {
    const spending = snapshot?.monthly_spending as Record<string, number> | undefined;
    if (spending) {
      const total = (spending.essentials || 0) + (spending.discretionary || 0) +
        (spending.debt_payments || 0) + (spending.subscriptions || 0);
      const income = Number(snapshot?.monthly_income) || 0;
      let response = `Here's your monthly spending breakdown:\n\n  - **Essentials** (housing, groceries, utilities): $${spending.essentials || 0}\n  - **Discretionary** (dining, shopping, etc.): $${spending.discretionary || 0}\n  - **Debt Payments**: $${spending.debt_payments || 0}\n  - **Subscriptions**: $${spending.subscriptions || 0}\n\n**Total:** $${total}/month`;
      if (income > 0) {
        const pct = ((total / income) * 100).toFixed(0);
        response += ` (${pct}% of your $${income.toFixed(0)} monthly income)`;
      }
      // Actionable advice
      if (spending.discretionary > spending.essentials * 0.3) {
        response += "\n\nYour discretionary spending is relatively high compared to essentials. Look for easy wins like reducing dining out or shopping by even 10-15%.";
      } else if (spending.subscriptions > 50) {
        response += "\n\nYour subscriptions add up — consider reviewing which ones you actually use regularly.";
      } else {
        response += "\n\nYour spending mix looks reasonable. The key is consistency — keeping essentials covered first, then seeing where small cuts can free up cash for savings or debt payoff.";
      }
      return response;
    }
    return "I don't have detailed spending data yet. The spending breakdown chart above shows where your money goes each month. Want me to help you find areas to cut back?";
  }

  // Subscriptions / cancel
  if (lower.includes("subscription") || lower.includes("cancel") || lower.includes("streaming") || lower.includes("netflix") || lower.includes("hulu") || lower.includes("spotify")) {
    const leaks = (snapshot?.subscription_leaks as Array<Record<string, unknown>>) || [];
    const subs = (snapshot?.subscriptions as Array<Record<string, unknown>>) || [];
    if (leaks.length > 0) {
      const leakList = leaks
        .slice(0, 5)
        .map((s) => `  - ${s.name}: $${Number(s.amount).toFixed(2)}/mo — ${s.leak_reason || "potential savings opportunity"}`)
        .join("\n");
      const totalLeak = leaks.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      return `I found ${leaks.length} subscription(s) that might be worth reviewing:\n\n${leakList}\n\nThat's potentially $${totalLeak.toFixed(2)}/month you could redirect toward your goals. You don't have to cancel everything at once — start with the one you use least and see how it feels for a month.`;
    }
    if (subs.length > 0) {
      const totalSub = subs.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      return `You have ${subs.length} active subscription(s) totaling about $${totalSub.toFixed(2)}/month. None are flagged as obvious leaks, but it's always worth reviewing them periodically. Ask yourself: "Did I use this in the last 2 weeks?" If not, it might be worth pausing.`;
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

  // Interest / APR
  if (lower.includes("interest") || lower.includes("apr")) {
    const debts = (snapshot?.debts as Array<Record<string, unknown>>) || [];
    if (debts.length > 0) {
      const totalInterest = debts.reduce((sum, d) => sum + (Number(d.monthly_interest) || 0), 0);
      const highestApr = [...debts].sort((a, b) => Number(b.apr) - Number(a.apr))[0];
      return `You're currently paying about $${totalInterest.toFixed(2)}/month in interest across your debts. Your highest rate is "${highestApr.name}" at ${highestApr.apr}% APR.\n\nEvery extra dollar you put toward the highest-APR debt saves you the most in the long run. Even $10-20 extra per month can meaningfully reduce how much interest you pay over time.`;
    }
    return "Interest is the cost of borrowing money. Credit cards typically charge 15-30% APR, while personal loans are often 5-15%. The higher the APR, the more expensive the debt — so it's usually best to prioritize paying down high-interest debt first.";
  }

  // Save / emergency fund
  if (lower.includes("save") || lower.includes("emergency") || lower.includes("savings") || lower.includes("rainy day")) {
    const freeCash = Number(snapshot?.free_cash_monthly) || 0;
    let suggestion = "";
    if (freeCash > 0) {
      const microSave = Math.min(freeCash * 0.1, 25);
      suggestion = `\n\nBased on your free cash of $${freeCash.toFixed(0)}/month, you could start by automatically saving $${microSave.toFixed(0)}/week into a separate savings account. That's $${(microSave * 4).toFixed(0)}/month — small, but it adds up to $${(microSave * 52).toFixed(0)} in a year!`;
    } else if (freeCash <= 0) {
      suggestion = `\n\nRight now your expenses exceed your income, so the priority is to find small cuts first. Even saving $5/week while you work on reducing spending builds the habit.`;
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

  // Bills / recurring
  if (lower.includes("bill") || lower.includes("recurring") || lower.includes("due date") || lower.includes("payment due")) {
    const bills = (snapshot?.recurring_bills as Array<Record<string, unknown>>) || [];
    if (bills.length > 0) {
      const billList = bills
        .slice(0, 8)
        .map((b) => `  - ${b.name}: $${Number(b.amount).toFixed(2)} (due day ${b.due_day})`)
        .join("\n");
      const totalBills = bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
      return `Here are your recurring bills:\n\n${billList}\n\n**Total recurring:** ~$${totalBills.toFixed(2)}/month\n\nTry to schedule bill payments right after your paychecks arrive to avoid low-balance situations. If any due dates are causing problems, many companies will let you change your due date — just call and ask!`;
    }
    return "I don't have detailed bill information. Most banks show recurring charges in their app. Knowing all your due dates helps you plan your cash flow and avoid late fees.";
  }

  // Plan / actions / what should I do
  if (lower.includes("plan") || lower.includes("action") || lower.includes("what should") || lower.includes("next step") || lower.includes("what do i do") || lower.includes("advice") || lower.includes("recommend") || lower.includes("suggest")) {
    const summary = (plan as Record<string, unknown>)?.summary;
    if (summary) {
      return `${summary}\n\nWould you like me to explain any specific action in your plan, or help you understand your overdraft risk, subscriptions, or debt payoff strategies?`;
    }
    return "Your personalized plan is displayed above. It's organized into Week 1 (most urgent), Week 2 (important), and Ongoing actions. Start with the Week 1 items — they'll have the biggest immediate impact. Would you like me to explain any part of it?";
  }

  // Credit score
  if (lower.includes("credit score") || lower.includes("credit rating") || lower.includes("fico")) {
    return "While I don't have your credit score data, here are the key factors that affect it:\n\n1. **Payment history (35%)** — Never miss a minimum payment\n2. **Credit utilization (30%)** — Try to keep credit card balances below 30% of your limit\n3. **Length of history (15%)** — Keep old accounts open even if unused\n4. **Credit mix (10%)** — Having different types of credit helps\n5. **New inquiries (10%)** — Avoid opening many new accounts at once\n\nThe most impactful thing you can do right now is make all minimum payments on time. That single habit builds your score over time. This is educational info, not financial advice.";
  }

  // Help / what can you do
  if (lower.includes("help") || lower.includes("what can you") || lower.includes("what do you") || lower.includes("how do you work") || lower.includes("features")) {
    const summary = getFinancialSummary(snapshot);
    return `I am your AI financial copilot! ${summary ? summary + "\n\n" : ""}Here are things I can help you with:\n\n- **Your balance and spending** — where your money goes each month\n- **Overdraft risk** — when your balance might dip too low\n- **Subscriptions** — which recurring charges might be worth cutting\n- **Debt strategies** — avalanche vs snowball payoff methods\n- **Saving tips** — how to build an emergency fund\n- **Your plan** — what actions to take this week and why\n- **Bills and due dates** — your recurring payments\n- **Interest and APR** — how much your debt is costing you\n\nJust ask in your own words — I will do my best to help!`;
  }

  // Default — provide a helpful response with the user's financial context
  const summary = getFinancialSummary(snapshot);
  return `I appreciate your question! ${summary ? summary + " " : ""}I can help you understand your financial plan and data. Here are some things you can ask me about:\n\n- **Overdraft risk** — when your balance might dip too low\n- **Subscriptions** — which recurring charges might be worth cutting\n- **Spending breakdown** — where your money goes each month\n- **Debt strategies** — avalanche vs snowball payoff methods\n- **Saving tips** — how to build an emergency fund\n- **Your plan** — what actions to take and why\n\nTry asking something like "Where does my money go?" or "How can I save more?" and I will give you a personalized answer.`;
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
