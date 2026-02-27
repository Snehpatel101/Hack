# One Day or Day One — Equity Finance Copilot

An AI-powered financial coaching platform with quantum-ready optimization, designed to make financial wellness accessible to everyone.

---

## Overview

One Day or Day One is an agentic AI fintech application that combines universal data intake, financial snapshot analysis, QUBO optimization, scenario simulation, and climate-aware spending insights. It is built for equity — designed for underserved communities who need practical, shame-free financial guidance.

The platform delivers personalized financial coaching through an intelligent pipeline: upload your data (or answer a few questions), and the system analyzes spending patterns, detects risks, optimizes action plans, and projects your financial trajectory — all in seconds.

---

## Key Features

1. **Universal Financial Data Intake** — Upload any CSV or JSON format. The schema inference engine auto-detects columns (date, amount, description, category) with confidence scoring. No rigid templates required.

2. **AI Conversational Intake** — Prefer not to upload files? Answer guided questions instead. A chat-style interface builds your financial profile through natural conversation.

3. **Financial Snapshot** — Automated spending breakdown by category, recurring bill detection, subscription leak detection, and risk window prediction. See where your money goes at a glance.

4. **QUBO Optimization Engine** — Quantum-ready action selection using Quadratic Unconstrained Binary Optimization. Employs exact enumeration (n<=20), simulated annealing, or greedy fallback depending on problem size.

5. **90-Day Equity Curve** — Balance projection with income and expense markers, risk zones, and monotone cubic spline interpolation for smooth, accurate forecasting.

6. **GenAI Scenario Simulator** — Simulate financial shocks (rent spike, medical emergency, job loss, car repair) with projected outcomes, risk windows, and negotiation scripts tailored to your situation.

7. **Climate Wallet** — Estimate your spending carbon footprint using emission factors, discover low-friction swaps to reduce environmental impact, and find local green incentives.

8. **Personalized Weekly Plan** — AI-generated action plan with prioritized steps, savings estimates, and motivational coaching. Actionable guidance, not generic advice.

9. **Multi-Language Support** — Available in English, Spanish, French, Chinese, Hindi, and Arabic.

10. **AI Chat Assistant** — Context-aware chatbot for follow-up questions about your financial data and recommendations.

---

## Tech Stack

| Layer           | Technology                                                   |
| --------------- | ------------------------------------------------------------ |
| Framework       | Next.js 14 (App Router)                                      |
| Language        | TypeScript 5                                                 |
| Styling         | Tailwind CSS 3.4                                             |
| AI / LLM        | OpenAI GPT-4o-mini (with fallback), IBM watsonx.ai           |
| Optimization    | Custom QUBO solver (exact enumeration + simulated annealing) |
| Charts          | Pure SVG (no charting libraries)                              |
| Deployment      | Vercel-ready                                                 |

---

## Architecture

```
lib/           Core business logic (parser, normalizer, QUBO solver, actions, prompts)
components/    React client components (charts, forms, views)
app/api/       Next.js API routes (pipeline, scenario, climate, chat)
app/           Pages and layout
```

The application follows a pipeline architecture. Each API route orchestrates a specific stage of the analysis, and the client coordinates the full flow through sequential API calls. All heavy computation runs server-side; the client handles presentation and user interaction.

---

## Getting Started

```bash
git clone https://github.com/Snehpatel101/Hack.git
cd Hack
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the application.

---

## Environment Variables (Optional)

Create a `.env.local` file in the project root:

```
OPENAI_API_KEY=your_key_here        # For AI-powered plan generation
WATSONX_API_KEY=your_key_here       # For watsonx.ai chat
WATSONX_PROJECT_ID=your_project_id  # For watsonx.ai chat
```

The app works fully without API keys. All features have intelligent fallbacks that provide meaningful results using built-in heuristics and rule-based logic.

---

## Project Structure

```
Hack/
├── app/
│   ├── api/
│   │   ├── build-snapshot/route.ts   # Financial snapshot computation
│   │   ├── chat/route.ts             # AI chat assistant endpoint
│   │   ├── climate/route.ts          # Carbon footprint analysis
│   │   ├── optimize/route.ts         # QUBO optimization endpoint
│   │   ├── parse-upload/route.ts     # File parsing and normalization
│   │   ├── pipeline/route.ts         # Full analysis pipeline
│   │   ├── planner/route.ts          # Weekly plan generation
│   │   └── scenario/route.ts         # Scenario simulation
│   ├── fonts/                        # Geist font files
│   ├── globals.css                   # Global styles and animations
│   ├── layout.tsx                    # Root layout with metadata
│   └── page.tsx                      # Main application page
├── components/
│   ├── ActionCard.tsx                # Optimized action display cards
│   ├── CategoryPieChart.tsx          # SVG pie chart for spending
│   ├── ChatBot.tsx                   # AI chat assistant interface
│   ├── CollapsibleSection.tsx        # Expandable content sections
│   ├── ConversationalIntake.tsx      # Chat-based financial intake
│   ├── EquityCurve.tsx               # 90-day balance projection chart
│   ├── FileUpload.tsx                # CSV/JSON file upload handler
│   ├── LanguageSelector.tsx          # Multi-language toggle
│   ├── Logo.tsx                      # Application logo
│   ├── PlanView.tsx                  # Weekly plan display
│   ├── ProfileForm.tsx               # Manual profile input form
│   ├── QUBOVisualization.tsx         # Optimization process visualization
│   ├── RiskAlert.tsx                 # Risk window alerts
│   ├── SnapshotView.tsx              # Financial snapshot dashboard
│   └── WorkflowTrace.tsx            # Pipeline execution trace
├── lib/
│   ├── actions.ts                    # Financial action definitions
│   ├── normalizer.ts                 # Schema inference and normalization
│   ├── parser.ts                     # Transaction data parser
│   ├── prompts.ts                    # LLM prompt templates
│   ├── qubo.ts                       # QUBO solver implementation
│   ├── tools.ts                      # Utility functions
│   └── types.ts                      # TypeScript type definitions
├── demo/
│   └── demo_profile.json             # Sample financial profile
├── public/
│   └── demo/
│       └── demo_profile.json         # Public demo data
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## How It Works

1. **Upload / Input** — The universal normalizer ingests CSV or JSON data and infers the schema, mapping columns to date, amount, description, and category with confidence scores. Alternatively, the conversational intake builds a profile through guided questions.

2. **Parse** — The parser extracts individual transactions, detects recurring patterns (subscriptions, bills, income), and flags anomalies.

3. **Snapshot** — The snapshot builder computes spending breakdowns by category, identifies income streams, detects subscription leaks, and predicts upcoming risk windows where expenses may exceed available funds.

4. **Optimize** — The QUBO solver formulates action selection as a binary optimization problem. It evaluates combinations of financial actions (debt payoff strategies, savings targets, expense cuts) to maximize impact within constraints. For small action sets (n<=20), it uses exact enumeration; for larger sets, it falls back to simulated annealing.

5. **Plan** — The planner generates a personalized weekly action plan with prioritized steps, estimated savings, and coaching language tailored to the user's situation and language preference.

6. **Visualize** — Results are displayed through interactive SVG charts (equity curve, spending pie chart), action cards, risk alerts, and a conversational AI assistant for follow-up questions.

---

## Modes

### Financial Copilot

The full analysis pipeline. Upload a CSV or JSON file, or use the conversational intake to build your profile. The system runs the complete pipeline: parse, snapshot, optimize, plan, and visualize.

### Scenario Simulator

What-if analysis for financial shocks. Select a scenario type (rent spike, medical emergency, job loss, car repair), configure severity, and see projected outcomes including updated equity curves, risk windows, and negotiation scripts.

### Climate Wallet

Estimate the carbon footprint of your spending using category-based emission factors. Discover low-friction swaps that reduce environmental impact without lifestyle disruption, and explore local green incentives and rebates.

---

## Design Philosophy

- **Educational coaching, not financial advice.** The platform teaches and guides; it does not prescribe.
- **No shame, no guilt.** Language is supportive and motivational. Every user deserves practical help regardless of their financial situation.
- **Built for equity and accessibility.** Designed with underserved communities in mind. Multi-language support, flexible data intake, and no paywalls.
- **Cold color palette.** Navy, teal, cyan, and violet create a professional, calming interface that reduces financial anxiety.
- **Privacy-first.** Data stays on your device. No server-side storage of personal financial information.

---

## Disclaimer

This is an educational tool for financial literacy. It is not a substitute for professional financial advice. All estimates are approximate and based on the data provided. Consult a qualified financial advisor for personal financial decisions.

---

## License

MIT

---

## Team

Built for Hackathon 2025.
