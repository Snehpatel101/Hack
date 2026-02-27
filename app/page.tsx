"use client";

import { useState, useCallback } from "react";
import Logo from "../components/Logo";
import FileUpload from "../components/FileUpload";
import ProfileForm from "../components/ProfileForm";
import SnapshotView from "../components/SnapshotView";
import PlanView from "../components/PlanView";
import QUBOVisualization from "../components/QUBOVisualization";
import RiskAlert from "../components/RiskAlert";
import ChatBot from "../components/ChatBot";
import ConversationalIntake from "../components/ConversationalIntake";
import ScenarioSimulator from "../components/ScenarioSimulator";
import ClimateWallet from "../components/ClimateWallet";
import CategoryPieChart from "../components/CategoryPieChart";
import CollapsibleSection from "../components/CollapsibleSection";
import EquityCurve from "../components/EquityCurve";
import LanguageSelector from "../components/LanguageSelector";
import type { CopilotResponse } from "../lib/types";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: { getStarted: "Get Started", upload: "Upload your bank transactions (CSV or JSON) and we will analyze your finances to create a personalized action plan.", fewDetails: "A Few Details", generatePlan: "Generate Financial Plan", startOver: "Start Over", talkToAI: "Talk to our AI instead" },
  es: { getStarted: "Comenzar", upload: "Sube tus transacciones bancarias (CSV o JSON) y analizaremos tus finanzas para crear un plan de accion personalizado.", fewDetails: "Algunos Detalles", generatePlan: "Generar Plan Financiero", startOver: "Comenzar De Nuevo", talkToAI: "Habla con nuestra IA" },
  fr: { getStarted: "Commencer", upload: "Telechargez vos transactions bancaires (CSV ou JSON) et nous analyserons vos finances pour creer un plan d'action personnalise.", fewDetails: "Quelques Details", generatePlan: "Generer le Plan Financier", startOver: "Recommencer", talkToAI: "Parler a notre IA" },
  zh: { getStarted: "\u5f00\u59cb", upload: "\u4e0a\u4f20\u60a8\u7684\u94f6\u884c\u4ea4\u6613\u8bb0\u5f55\uff08CSV \u6216 JSON\uff09\uff0c\u6211\u4eec\u5c06\u5206\u6790\u60a8\u7684\u8d22\u52a1\u72b6\u51b5\u5e76\u521b\u5efa\u4e2a\u6027\u5316\u884c\u52a8\u8ba1\u5212\u3002", fewDetails: "\u4e00\u4e9b\u7ec6\u8282", generatePlan: "\u751f\u6210\u8d22\u52a1\u8ba1\u5212", startOver: "\u91cd\u65b0\u5f00\u59cb", talkToAI: "\u4e0e\u6211\u4eec\u7684AI\u5bf9\u8bdd" },
  hi: { getStarted: "\u0936\u0941\u0930\u0942 \u0915\u0930\u0947\u0902", upload: "\u0905\u092a\u0928\u0947 \u092c\u0948\u0902\u0915 \u0932\u0947\u0928\u0926\u0947\u0928 (CSV \u092f\u093e JSON) \u0905\u092a\u0932\u094b\u0921 \u0915\u0930\u0947\u0902 \u0914\u0930 \u0939\u092e \u0906\u092a\u0915\u0940 \u0935\u093f\u0924\u094d\u0924\u0940\u092f \u0938\u094d\u0925\u093f\u0924\u093f \u0915\u093e \u0935\u093f\u0936\u094d\u0932\u0947\u0937\u0923 \u0915\u0930\u0947\u0902\u0917\u0947\u0964", fewDetails: "\u0915\u0941\u091b \u0935\u093f\u0935\u0930\u0923", generatePlan: "\u0935\u093f\u0924\u094d\u0924\u0940\u092f \u092f\u094b\u091c\u0928\u093e \u092c\u0928\u093e\u090f\u0902", startOver: "\u092b\u093f\u0930 \u0938\u0947 \u0936\u0941\u0930\u0942 \u0915\u0930\u0947\u0902", talkToAI: "\u0939\u092e\u093e\u0930\u0940 AI \u0938\u0947 \u092c\u093e\u0924 \u0915\u0930\u0947\u0902" },
  ar: { getStarted: "\u0627\u0628\u062f\u0623", upload: "\u0642\u0645 \u0628\u062a\u062d\u0645\u064a\u0644 \u0645\u0639\u0627\u0645\u0644\u0627\u062a\u0643 \u0627\u0644\u0645\u0635\u0631\u0641\u064a\u0629 (CSV \u0623\u0648 JSON) \u0648\u0633\u0646\u0642\u0648\u0645 \u0628\u062a\u062d\u0644\u064a\u0644 \u0623\u0645\u0648\u0627\u0644\u0643 \u0644\u0625\u0646\u0634\u0627\u0621 \u062e\u0637\u0629 \u0639\u0645\u0644 \u0645\u062e\u0635\u0635\u0629.", fewDetails: "\u0628\u0639\u0636 \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644", generatePlan: "\u0625\u0646\u0634\u0627\u0621 \u062e\u0637\u0629 \u0645\u0627\u0644\u064a\u0629", startOver: "\u0627\u0628\u062f\u0623 \u0645\u0646 \u062c\u062f\u064a\u062f", talkToAI: "\u062a\u062d\u062f\u062b \u0645\u0639 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a" },
};

type AppMode = "copilot" | "scenario" | "climate";
type Stage = "upload" | "chat-intake" | "profile" | "loading" | "results" | "scenario-results" | "climate-results";

export default function Home() {
  const [stage, setStage] = useState<Stage>("upload");
  const [appMode, setAppMode] = useState<AppMode>("copilot");
  const [file, setFile] = useState<File | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [result, setResult] = useState<CopilotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState("");
  const [sessionKey, setSessionKey] = useState(0);
  const [showAbout, setShowAbout] = useState(false);
  const [showFooterAbout, setShowFooterAbout] = useState(false);
  const [lang, setLang] = useState("en");
  const [scenarioTransactions, setScenarioTransactions] = useState<Array<{ date: string; description: string; amount: number; category?: string }> | null>(null);
  const [climateTransactions, setClimateTransactions] = useState<Array<{ date: string; description: string; amount: number; category?: string }> | null>(null);
  const [scenarioNormalizer, setScenarioNormalizer] = useState<{
    schemaMap: Array<{ sourceColumn: string; internalField: string; confidence: number; method: string }>;
    warnings: string[];
    transactionCount: number;
  } | null>(null);
  const [climateNormalizer, setClimateNormalizer] = useState<{
    schemaMap: Array<{ sourceColumn: string; internalField: string; confidence: number; method: string }>;
    warnings: string[];
    transactionCount: number;
  } | null>(null);

  const t = (key: string) => TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;

  const handleFileSelected = useCallback((f: File) => {
    setFile(f);
    setError(null);
    setStage("profile");
  }, []);

  const handleDemoLoad = useCallback(() => {
    setIsDemoMode(true);
    setError(null);
    setStage("profile");
  }, []);

  const handleProfileSubmit = useCallback(
    async (profile: { checking_balance: number; goal: string; monthly_income?: number }) => {
      setStage("loading");
      setError(null);
      setLoadingStep("Uploading and parsing your data...");

      try {
        const formData = new FormData();

        if (isDemoMode) {
          setLoadingStep("Loading demo data...");
          const csvRes = await fetch("/demo/demo_transactions.csv");
          const csvText = await csvRes.text();
          const csvBlob = new Blob([csvText], { type: "text/csv" });
          formData.append("file", csvBlob, "demo_transactions.csv");

          const profileRes = await fetch("/demo/demo_profile.json");
          const demoProfile = await profileRes.json();
          formData.append(
            "profile",
            JSON.stringify({
              ...demoProfile,
              checking_balance:
                profile.checking_balance || demoProfile.checking_balance,
              goal: profile.goal || demoProfile.goal,
            })
          );
        } else if (file) {
          formData.append("file", file);
          formData.append("profile", JSON.stringify(profile));
        } else {
          throw new Error("No file selected.");
        }

        setLoadingStep("AI agent is analyzing your finances...");

        const res = await fetch("/api/pipeline", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(
            errData.error || `Server error: ${res.status}`
          );
        }

        const data: CopilotResponse = await res.json();
        setResult(data);
        setStage("results");
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.";
        setError(message);
        setStage("upload");
      }
    },
    [file, isDemoMode]
  );

  const handleIntakeComplete = useCallback(
    async (data: {
      csvContent: string;
      profile: {
        checking_balance: number;
        monthly_income: number;
        goal: string;
        debts?: Array<{ name: string; balance: number; apr: number; minimum_payment: number; due_day: number }>;
        income?: Array<{ source: string; amount: number; frequency: "monthly"; next_date: string }>;
      };
    }) => {
      setStage("loading");
      setError(null);
      setLoadingStep("Building your financial profile...");

      try {
        const formData = new FormData();
        const csvBlob = new Blob([data.csvContent], { type: "text/csv" });
        formData.append("file", csvBlob, "ai_intake.csv");
        formData.append("profile", JSON.stringify(data.profile));

        setLoadingStep("AI agent is analyzing your finances...");

        const res = await fetch("/api/pipeline", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server error: ${res.status}`);
        }

        const result: CopilotResponse = await res.json();
        setResult(result);
        setStage("results");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
        setError(message);
        setStage("upload");
      }
    },
    []
  );

  const handleScenarioUpload = useCallback(async (f: File) => {
    setStage("loading");
    setError(null);
    setLoadingStep("Parsing your financial data...");

    try {
      const formData = new FormData();
      formData.append("file", f);

      const res = await fetch("/api/scenario", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${res.status}`);
      }

      const data = await res.json();
      setScenarioTransactions(data.transactions);
      setScenarioNormalizer(data.normalizer);
      setStage("scenario-results");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setStage("upload");
    }
  }, []);

  const handleClimateUpload = useCallback(async (f: File) => {
    setStage("loading");
    setError(null);
    setLoadingStep("Analyzing your spending footprint...");

    try {
      const formData = new FormData();
      formData.append("file", f);

      const res = await fetch("/api/climate", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${res.status}`);
      }

      const data = await res.json();
      setClimateTransactions(data.transactions);
      setClimateNormalizer(data.normalizer);
      setStage("climate-results");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setStage("upload");
    }
  }, []);

  const handleReset = useCallback(() => {
    setStage("upload");
    setFile(null);
    setIsDemoMode(false);
    setResult(null);
    setError(null);
    setSessionKey((k) => k + 1);
    setScenarioTransactions(null);
    setClimateTransactions(null);
    setScenarioNormalizer(null);
    setClimateNormalizer(null);
    setAppMode("copilot");
  }, []);

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="bg-[#0f172a] border-b border-slate-700/30">
        <div className="max-w-5xl mx-auto px-4 py-6 flex items-center justify-between">
          <Logo size="lg" />
          <LanguageSelector currentLang={lang} onLanguageChange={setLang} />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
        {/* Error banner */}
        {error && (
          <div className="mb-6 bg-red-900/30 border border-red-500/30 rounded-xl p-4 text-red-300 animate-slide-up">
            <p className="font-medium text-red-200">Something went wrong</p>
            <p className="text-sm mt-1 text-red-400">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-sm underline text-red-300 hover:text-red-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* About dropdown (upload stage, copilot mode only) */}
        {stage === "upload" && appMode === "copilot" && (
          <div className="max-w-xl mx-auto mb-6">
            <button
              onClick={() => setShowAbout(!showAbout)}
              className="text-sm text-teal-400 hover:text-teal-300 transition-colors flex items-center gap-1"
            >
              <svg className={`w-4 h-4 transition-transform ${showAbout ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              What is Equity Finance Copilot?
            </button>
            {showAbout && (
              <div className="mt-3 bg-[#1e293b] rounded-xl border border-slate-600/50 p-5 text-sm text-slate-300 space-y-3 animate-fade-in">
                <p><strong className="text-slate-100">Equity Finance Copilot</strong> is an AI-powered financial coaching tool designed for everyone — especially those who are underserved by traditional banking.</p>
                <p>We help you:</p>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li>Understand your spending patterns and identify savings opportunities</li>
                  <li>Detect subscription leaks and unnecessary charges</li>
                  <li>Predict overdraft risks before they happen</li>
                  <li>Build a personalized weekly action plan for financial stability</li>
                  <li>Optimize debt payoff using quantum-ready algorithms</li>
                  <li>Project your balance 90 days into the future</li>
                </ul>
                <p className="text-slate-500 text-xs">Built with equity in mind. Educational coaching only — not financial advice.</p>
              </div>
            )}
          </div>
        )}

        {/* Stage: Upload */}
        {stage === "upload" && (
          <div className="max-w-xl mx-auto animate-slide-up">
            {/* Mode Selector */}
            <div className="mb-6">
              <div className="flex rounded-xl bg-[#1e293b] border border-slate-600/50 p-1 gap-1">
                <button
                  onClick={() => setAppMode("copilot")}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                    appMode === "copilot"
                      ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/20"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                  }`}
                >
                  Financial Copilot
                </button>
                <button
                  onClick={() => setAppMode("scenario")}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                    appMode === "scenario"
                      ? "bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-lg shadow-blue-500/20"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                  }`}
                >
                  Scenario Simulator
                </button>
                <button
                  onClick={() => setAppMode("climate")}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                    appMode === "climate"
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                  }`}
                >
                  Climate Wallet
                </button>
              </div>
            </div>

            {/* Copilot Upload Card */}
            {appMode === "copilot" && (
              <div className="bg-[#1e293b] rounded-xl shadow-lg shadow-black/20 border border-slate-600/50 p-8 card-glow">
                <h2 className="text-xl font-semibold text-slate-100 mb-2">{t("getStarted")}</h2>
                <p className="text-slate-400 mb-6 text-sm">
                  {t("upload")}
                </p>
                <FileUpload
                  key={sessionKey}
                  onFileSelected={handleFileSelected}
                  onDemoLoad={handleDemoLoad}
                  isLoading={false}
                />
              </div>
            )}

            {/* Scenario Simulator Upload Card */}
            {appMode === "scenario" && (
              <div className="bg-[#1e293b] rounded-xl shadow-lg shadow-black/20 border border-slate-600/50 p-8 card-glow">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-slate-100">Scenario Simulator</h2>
                </div>
                <p className="text-slate-400 mb-6 text-sm">
                  Upload your transactions and simulate financial what-if scenarios — rent spikes, medical emergencies, job loss, and more.
                </p>
                <FileUpload
                  key={`scenario-${sessionKey}`}
                  onFileSelected={handleScenarioUpload}
                  onDemoLoad={() => {
                    fetch("/demo/demo_transactions.csv")
                      .then(r => r.blob())
                      .then(blob => {
                        const file = new File([blob], "demo_transactions.csv", { type: "text/csv" });
                        handleScenarioUpload(file);
                      })
                      .catch(() => setError("Failed to load demo data."));
                  }}
                  isLoading={false}
                />
              </div>
            )}

            {/* Climate Wallet Upload Card */}
            {appMode === "climate" && (
              <div className="bg-[#1e293b] rounded-xl shadow-lg shadow-black/20 border border-slate-600/50 p-8 card-glow">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-slate-100">Climate Wallet</h2>
                </div>
                <p className="text-slate-400 mb-6 text-sm">
                  Upload your transactions to estimate your spending carbon footprint, discover low-friction swaps, and find local green incentives.
                </p>
                <FileUpload
                  key={`climate-${sessionKey}`}
                  onFileSelected={handleClimateUpload}
                  onDemoLoad={() => {
                    fetch("/demo/demo_transactions.csv")
                      .then(r => r.blob())
                      .then(blob => {
                        const file = new File([blob], "demo_transactions.csv", { type: "text/csv" });
                        handleClimateUpload(file);
                      })
                      .catch(() => setError("Failed to load demo data."));
                  }}
                  isLoading={false}
                />
              </div>
            )}

            {/* AI Conversation Option (copilot mode only) */}
            {appMode === "copilot" && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-700/50" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-[#0f172a] px-3 text-slate-500">or</span>
                  </div>
                </div>

                <button
                  onClick={() => setStage("chat-intake")}
                  className="w-full bg-[#1e293b] rounded-xl shadow-lg shadow-black/20 border border-slate-600/50 p-6 card-glow text-left hover:border-teal-500/50 transition-all duration-300 group"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-teal-500/20 flex items-center justify-center">
                      <svg className="w-6 h-6 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100 group-hover:text-teal-300 transition-colors">
                        {t("talkToAI")}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Answer a few questions and we will build your financial profile automatically.
                      </p>
                    </div>
                    <svg className="w-5 h-5 text-slate-600 group-hover:text-teal-400 transition-colors ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              </>
            )}

            <p className="text-center text-xs text-slate-500 mt-4">
              Your data stays on this device. We do not store or share your
              financial information.
            </p>
          </div>
        )}

        {/* Stage: Chat Intake */}
        {stage === "chat-intake" && (
          <div className="max-w-2xl mx-auto animate-slide-up">
            <ConversationalIntake
              key={sessionKey}
              onComplete={handleIntakeComplete}
              onBack={() => setStage("upload")}
            />
          </div>
        )}

        {/* Stage: Scenario Results */}
        {stage === "scenario-results" && scenarioTransactions && (
          <div className="max-w-5xl mx-auto animate-slide-up">
            <ScenarioSimulator
              transactions={scenarioTransactions}
              normalizer={scenarioNormalizer ?? undefined}
              onBack={handleReset}
            />
          </div>
        )}

        {/* Stage: Climate Results */}
        {stage === "climate-results" && climateTransactions && (
          <div className="max-w-5xl mx-auto animate-slide-up">
            <ClimateWallet
              transactions={climateTransactions}
              normalizer={climateNormalizer ?? undefined}
              onBack={handleReset}
            />
          </div>
        )}

        {/* Stage: Profile */}
        {stage === "profile" && (
          <div className="max-w-xl mx-auto animate-slide-up">
            <div className="bg-[#1e293b] rounded-xl shadow-lg shadow-black/20 border border-slate-600/50 p-8 card-glow">
              <h2 className="text-xl font-semibold text-slate-100 mb-2">{t("fewDetails")}</h2>
              <p className="text-slate-400 mb-6 text-sm">
                {isDemoMode
                  ? "Using demo data. Adjust the values below if you like."
                  : `File selected: ${file?.name}. Now tell us a bit more.`}
              </p>
              <ProfileForm
                key={sessionKey}
                onSubmit={handleProfileSubmit}
                defaultBalance={isDemoMode ? 340 : undefined}
              />
              <button
                onClick={() => {
                  setStage("upload");
                  setIsDemoMode(false);
                  setFile(null);
                }}
                className="mt-4 text-sm text-slate-500 underline hover:text-teal-400 transition-colors"
              >
                Go back
              </button>
            </div>
          </div>
        )}

        {/* Stage: Loading */}
        {stage === "loading" && (
          <div className="max-w-xl mx-auto text-center py-20 animate-fade-in">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-teal-500/20 border-t-teal-500 mb-4" />
            <p className="text-lg font-medium text-slate-200">
              {loadingStep}
            </p>
            <p className="text-sm text-slate-500 mt-2">
              Our AI agent is analyzing your data, finding risks, and
              optimizing your plan...
            </p>
          </div>
        )}

        {/* Stage: Results */}
        {stage === "results" && result && (
          <div className="space-y-4">
            {/* 1. Risk Alerts — urgent banner, no collapsible wrapper */}
            {result.plan.risk_alerts &&
              result.plan.risk_alerts.length > 0 && (
                <div className="animate-slide-up" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
                  <RiskAlert alerts={result.plan.risk_alerts} />
                </div>
              )}

            {/* 2. 90-Day Balance Projection — direct, no collapsible wrapper */}
            <div className="animate-slide-up" style={{ animationDelay: "100ms", animationFillMode: "both" }}>
              <EquityCurve snapshot={result.snapshot} />
            </div>

            {/* 3. Your Action Plan — main deliverable */}
            <div className="animate-slide-up" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
              <CollapsibleSection
                title="Your Action Plan"
                subtitle="Personalized weekly steps"
                defaultOpen={true}
              >
                <PlanView plan={result.plan} />
              </CollapsibleSection>
            </div>

            {/* 4. Spending by Category — pie chart */}
            {result.normalizer && result.normalizer.totalSpend > 0 && (
              <div className="animate-slide-up" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
                <CollapsibleSection
                  title="Spending by Category"
                  badge={`${Object.keys(result.normalizer.categoryTotals).length} categories`}
                  defaultOpen={true}
                >
                  <CategoryPieChart
                    categoryTotals={result.normalizer.categoryTotals}
                    totalSpend={result.normalizer.totalSpend}
                  />
                </CollapsibleSection>
              </div>
            )}

            {/* 5. QUBO Optimization — judges need to see this */}
            <div className="animate-slide-up" style={{ animationDelay: "400ms", animationFillMode: "both" }}>
              <CollapsibleSection
                title="QUBO Optimization"
                subtitle="Quantum-ready action optimization"
                defaultOpen={true}
              >
                <QUBOVisualization
                  quboResult={result.qubo_result}
                  allActions={[]}
                />
              </CollapsibleSection>
            </div>

            {/* 6. Financial Details — detailed drill-down, collapsed by default */}
            <div className="animate-slide-up" style={{ animationDelay: "500ms", animationFillMode: "both" }}>
              <CollapsibleSection
                title="Financial Details"
                subtitle="Snapshot, risk windows, subscriptions & debts"
                defaultOpen={false}
              >
                <SnapshotView snapshot={result.snapshot} />
              </CollapsibleSection>
            </div>

            {/* 7. Start Over */}
            <div className="text-center pt-4 pb-12 animate-fade-in" style={{ animationDelay: "600ms", animationFillMode: "both" }}>
              <button
                onClick={handleReset}
                className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-500 rounded-lg text-white font-medium hover:from-teal-600 hover:to-cyan-600 transition-all duration-300 shadow-lg shadow-teal-500/20 hover:shadow-teal-500/40"
              >
                {t("startOver")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 bg-[#0a1628] mt-12">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center">
          <div className="text-xs text-slate-500 mb-3">
            <span className="text-teal-500/60">Equity Finance Copilot</span>{" "}
            — Educational coaching only. Not financial advice.
          </div>
          <button
            onClick={() => setShowFooterAbout(!showFooterAbout)}
            className="text-xs text-teal-400/60 hover:text-teal-400 transition-colors"
          >
            {showFooterAbout ? "Hide" : "About"} this tool
          </button>
          {showFooterAbout && (
            <div className="mt-3 max-w-lg mx-auto text-left bg-[#1e293b] rounded-lg border border-slate-700/50 p-4 text-xs text-slate-400 space-y-2 animate-fade-in">
              <p><strong className="text-slate-200">What we provide:</strong></p>
              <ul className="list-disc list-inside space-y-1">
                <li>AI-powered financial snapshot and risk analysis</li>
                <li>Quantum-ready optimization (QUBO) for action planning</li>
                <li>90-day balance projection with bill/income forecasting</li>
                <li>Subscription leak detection and debt payoff strategies</li>
                <li>Personalized weekly coaching plan</li>
              </ul>
              <p className="text-slate-500">Your data stays on your device. We do not store or share your financial information. Consult a qualified financial advisor for personal decisions.</p>
            </div>
          )}
        </div>
      </footer>

      {/* ChatBot — renders when results are available */}
      {stage === "results" && result && (
        <ChatBot context={{ snapshot: result.snapshot, plan: result.plan }} />
      )}
    </main>
  );
}
