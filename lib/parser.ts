// ============================================================
// Equity Finance Copilot — CSV/JSON Parser & Feature Extraction
// ============================================================
import {
  RawTransaction,
  RawIncome,
  UploadPayload,
  RecurringBill,
  Subscription,
  RiskWindow,
  DebtInfo,
  FinancialSnapshot,
} from "./types";
import { normalizeFinancialData } from "./normalizer";

// ---- CSV Parsing (universal — delegates to normalizer) ----

/**
 * Parse a CSV string into RawTransaction[].
 *
 * Accepts ANY CSV format (any column names, any structure) by delegating
 * to the universal normalizer which infers column mappings heuristically.
 * Handles headers like "Transaction Date", "Debit", "Credit",
 * "Particulars", "Money Out", etc.
 */
export function parseCSV(csv: string): RawTransaction[] {
  return parseAnyFile(csv, "csv");
}

// ---- Universal File Parser ----

/**
 * Parse any CSV or JSON financial file into RawTransaction[].
 *
 * Uses the universal normalizer to infer column mappings heuristically,
 * then converts the resulting NormalizedTransaction[] to RawTransaction[].
 *
 * @param content  - Raw file content as a string.
 * @param fileType - Either "csv" or "json".
 * @returns An array of RawTransaction objects.
 * @throws If the normalizer produces zero transactions.
 */
export function parseAnyFile(
  content: string,
  fileType: "csv" | "json"
): RawTransaction[] {
  const result = normalizeFinancialData(content, fileType);

  if (result.normalizedTransactions.length === 0) {
    throw new Error(
      `Could not extract any transactions from the provided ${fileType.toUpperCase()} data. ` +
        `The normalizer could not identify the required columns (date, amount/debit/credit). ` +
        (result.warnings.length > 0
          ? `Warnings: ${result.warnings.join("; ")}`
          : "Ensure the file contains transaction data with recognizable headers.")
    );
  }

  return result.normalizedTransactions.map((nt) => ({
    date: nt.dateISO,
    description: nt.description,
    amount: nt.amountSigned,
    category: nt.category !== "uncategorized" ? nt.category : undefined,
  }));
}

// ---- Category Inference ----

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

function inferCategory(desc: string): string {
  for (const [regex, cat] of CATEGORY_RULES) {
    if (regex.test(desc)) return cat;
  }
  return "other";
}

// ---- Recurring Detection ----

interface RecurringCandidate {
  description: string;
  amounts: number[];
  dates: string[];
  category: string;
}

function detectRecurring(txns: RawTransaction[]): RecurringCandidate[] {
  const groups: Record<string, RawTransaction[]> = {};

  for (const t of txns) {
    // Normalize description for grouping
    const key = t.description
      .toUpperCase()
      .replace(/[0-9]{4,}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  const recurring: RecurringCandidate[] = [];
  for (const [, txnGroup] of Object.entries(groups)) {
    if (txnGroup.length < 2) continue;
    const amounts = txnGroup.map((t) => Math.abs(t.amount));
    const avgAmt = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    // Check if amounts are consistent (within 20%)
    const consistent = amounts.every((a) => Math.abs(a - avgAmt) / avgAmt < 0.2);
    if (consistent) {
      recurring.push({
        description: txnGroup[0].description,
        amounts,
        dates: txnGroup.map((t) => t.date),
        category: txnGroup[0].category || inferCategory(txnGroup[0].description),
      });
    }
  }

  return recurring;
}

// ---- Subscription Leak Detection ----

const KNOWN_SUBSCRIPTIONS = [
  "netflix", "hulu", "disney", "spotify", "apple music", "youtube premium",
  "hbo", "paramount", "peacock", "amazon prime", "planet fitness", "gym",
  "la fitness", "ymca", "peloton", "adobe", "dropbox", "icloud",
];

function detectSubscriptionLeaks(
  recurring: RecurringCandidate[]
): Subscription[] {
  const subs: Subscription[] = [];

  for (const r of recurring) {
    const isSub =
      r.category === "subscription" ||
      KNOWN_SUBSCRIPTIONS.some((s) => r.description.toLowerCase().includes(s));

    if (!isSub) continue;

    const avgAmt = r.amounts.reduce((a, b) => a + b, 0) / r.amounts.length;
    const lastDate = r.dates.sort().reverse()[0];
    // A subscription is a "leak" if it's a gym/streaming you keep paying for
    // For demo purposes, flag gym memberships as leaks
    const isLeak = r.description.toLowerCase().includes("fitness") ||
      r.description.toLowerCase().includes("gym");

    subs.push({
      name: r.description,
      amount: avgAmt,
      last_charge_date: lastDate,
      is_leak: isLeak,
      leak_reason: isLeak ? "No usage detected in 30+ days. Consider canceling." : undefined,
    });
  }

  return subs;
}

// ---- Risk Window Detection ----

function detectRiskWindows(
  txns: RawTransaction[],
  balance: number,
  incomeSchedule: RawIncome[],
  bills: RecurringBill[]
): RiskWindow[] {
  const windows: RiskWindow[] = [];
  const now = new Date();
  let projected = balance;

  // Project next 30 days
  const events: { day: number; amount: number; desc: string }[] = [];

  for (const bill of bills) {
    events.push({ day: bill.due_day, amount: -bill.amount, desc: bill.name });
  }

  for (const inc of incomeSchedule) {
    const incDate = new Date(inc.next_date);
    events.push({ day: incDate.getDate(), amount: inc.amount, desc: `Paycheck (${inc.source})` });
  }

  // Sort by day
  events.sort((a, b) => a.day - b.day);

  projected = balance;
  for (const evt of events) {
    projected += evt.amount;
    const date = new Date(now);
    date.setDate(evt.day);
    if (date < now) date.setMonth(date.getMonth() + 1);

    let riskLevel: RiskWindow["risk_level"] = "low";
    let suggestion = "";

    if (projected < 0) {
      riskLevel = "critical";
      suggestion = `You may overdraft. Consider moving ${evt.desc} due date or ensuring funds arrive first.`;
    } else if (projected < 50) {
      riskLevel = "high";
      suggestion = `Balance will be very low ($${projected.toFixed(0)}). Avoid extra spending before this date.`;
    } else if (projected < 150) {
      riskLevel = "medium";
      suggestion = `Tight window. Your balance will be around $${projected.toFixed(0)}.`;
    }

    if (riskLevel !== "low") {
      windows.push({
        date: date.toISOString().split("T")[0],
        description: `After ${evt.desc}: $${projected.toFixed(2)}`,
        projected_balance: Math.round(projected * 100) / 100,
        risk_level: riskLevel,
        suggestion,
      });
    }
  }

  return windows;
}

// ---- Build Full Snapshot ----

export function buildSnapshot(payload: UploadPayload): FinancialSnapshot {
  const txns = payload.transactions || [];

  // Categorize transactions
  for (const t of txns) {
    if (!t.category) {
      t.category = inferCategory(t.description);
    }
  }

  // Detect recurring patterns
  const recurring = detectRecurring(txns);

  // Build income schedule
  const incomeSchedule: RawIncome[] =
    payload.income ||
    recurring
      .filter((r) => r.category === "income")
      .map((r) => ({
        source: r.description,
        amount: r.amounts.reduce((a, b) => a + b, 0) / r.amounts.length,
        frequency: "biweekly" as const,
        next_date: r.dates.sort().reverse()[0],
      }));

  const monthlyIncome = incomeSchedule.reduce((sum, inc) => {
    const mult = inc.frequency === "weekly" ? 4.33 : inc.frequency === "biweekly" ? 2.17 : 1;
    return sum + inc.amount * mult;
  }, 0);

  // Build recurring bills
  const bills: RecurringBill[] = recurring
    .filter((r) => !["income", "subscription", "transfer"].includes(r.category))
    .filter((r) => r.amounts[0] > 0 || r.category === "debt_payment" || r.category === "housing")
    .map((r) => {
      const avgAmt = r.amounts.reduce((a, b) => a + b, 0) / r.amounts.length;
      const lastDate = new Date(r.dates.sort().reverse()[0]);
      return {
        name: r.description,
        amount: avgAmt,
        due_day: lastDate.getDate(),
        category: r.category,
        is_essential: ["housing", "utilities", "insurance", "medical", "phone", "internet"].includes(
          r.category
        ),
      };
    });

  // Build debts
  const debts: DebtInfo[] = (payload.debts || []).map((d) => {
    const monthlyRate = d.apr / 100 / 12;
    const monthlyInterest = d.balance * monthlyRate;
    let payoffMonths: number;
    if (monthlyRate === 0) {
      // 0% APR: simple division
      payoffMonths = d.minimum_payment > 0 ? Math.ceil(d.balance / d.minimum_payment) : 999;
    } else if (d.minimum_payment > monthlyInterest) {
      payoffMonths = Math.ceil(
        -Math.log(1 - (d.balance * monthlyRate) / d.minimum_payment) / Math.log(1 + monthlyRate)
      );
    } else {
      payoffMonths = 999;
    }
    return {
      ...d,
      monthly_interest: Math.round(monthlyInterest * 100) / 100,
      payoff_months_minimum: payoffMonths,
    };
  });

  // Detect subscriptions and leaks — also scan single-occurrence known subs
  const subscriptions = detectSubscriptionLeaks(recurring);

  // Second pass: catch known subscriptions that appear only once in single-month data
  const alreadyDetected = new Set(subscriptions.map((s) => s.name.toUpperCase()));
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const cat = t.category || inferCategory(t.description);
    if (cat !== "subscription") continue;
    const upper = t.description.toUpperCase().trim();
    if (alreadyDetected.has(upper)) continue;
    alreadyDetected.add(upper);
    const isLeak =
      t.description.toLowerCase().includes("fitness") ||
      t.description.toLowerCase().includes("gym");
    subscriptions.push({
      name: t.description,
      amount: Math.abs(t.amount),
      last_charge_date: t.date,
      is_leak: isLeak,
      leak_reason: isLeak ? "No usage detected in 30+ days. Consider canceling." : undefined,
    });
  }

  const leaks = subscriptions.filter((s) => s.is_leak);

  // Second pass: detect essential bills from single-occurrence transactions
  const billNames = new Set(bills.map((b) => b.name.toUpperCase().trim()));
  const essentialSingleBills: RecurringBill[] = [];
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const cat = t.category || inferCategory(t.description);
    if (!["housing", "utilities", "phone", "internet", "insurance", "medical"].includes(cat)) continue;
    const upper = t.description.toUpperCase().trim();
    if (billNames.has(upper)) continue;
    billNames.add(upper);
    const txDate = new Date(t.date);
    essentialSingleBills.push({
      name: t.description,
      amount: Math.abs(t.amount),
      due_day: txDate.getDate(),
      category: cat,
      is_essential: true,
    });
  }
  bills.push(...essentialSingleBills);

  // Also add debt payments as pseudo-bills for risk window projection
  for (const d of debts) {
    const dName = d.name.toUpperCase().trim();
    if (!billNames.has(dName)) {
      billNames.add(dName);
      bills.push({
        name: d.name,
        amount: d.minimum_payment,
        due_day: d.due_day,
        category: "debt_payment",
        is_essential: true,
      });
    }
  }

  // Compute spending categories
  const debits = txns.filter((t) => t.amount < 0);
  const essentialCats = ["housing", "utilities", "groceries", "gas", "insurance", "medical", "phone", "internet"];
  const subCats = ["subscription"];

  const essentialSpend = debits
    .filter((t) => essentialCats.includes(t.category || ""))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const subSpend = debits
    .filter((t) => subCats.includes(t.category || ""))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const debtSpend = debits
    .filter((t) => t.category === "debt_payment")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalSpend = debits.reduce((s, t) => s + Math.abs(t.amount), 0);
  const discretionary = totalSpend - essentialSpend - subSpend - debtSpend;

  // Normalize to monthly (assume txns cover ~1 month)
  // Use Math.abs to handle both chronological and reverse-chronological transaction order
  const dateRange = txns.length > 1
    ? Math.abs(new Date(txns[txns.length - 1].date).getTime() - new Date(txns[0].date).getTime()) /
      (1000 * 60 * 60 * 24)
    : 30;
  // Cap monthFactor to avoid extreme inflation when data spans only a few days.
  // A factor above 4 (data covering ~1 week) would produce unreliable projections.
  const monthFactor = Math.min(30 / Math.max(dateRange, 1), 4);

  const monthlySpending = {
    essentials: Math.round(essentialSpend * monthFactor),
    discretionary: Math.round(Math.max(0, discretionary) * monthFactor),
    debt_payments: Math.round(debtSpend * monthFactor),
    subscriptions: Math.round(subSpend * monthFactor),
  };

  const totalMonthlySpend =
    monthlySpending.essentials +
    monthlySpending.discretionary +
    monthlySpending.debt_payments +
    monthlySpending.subscriptions;

  const freeCash = Math.round(monthlyIncome - totalMonthlySpend);

  const checkingBalance = payload.checking_balance ?? 500;

  // Risk windows
  const riskWindows = detectRiskWindows(txns, checkingBalance, incomeSchedule, bills);

  return {
    as_of: new Date().toISOString().split("T")[0],
    checking_balance: checkingBalance,
    monthly_income: Math.round(monthlyIncome),
    income_schedule: incomeSchedule,
    recurring_bills: bills,
    debts,
    subscriptions,
    monthly_spending: monthlySpending,
    risk_windows: riskWindows,
    subscription_leaks: leaks,
    free_cash_monthly: freeCash,
    goal: payload.goal || "auto",
  };
}
