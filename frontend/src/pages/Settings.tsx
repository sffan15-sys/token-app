import { useState } from "react";
import { PLATFORMS } from "../data/mockData";

const THRESHOLDS = [
  { label: "Approaching-limit warning", value: "70% used" },
  { label: "Approaching-limit critical", value: "90% used" },
  { label: "Idle allowance nudge", value: "45 min with no activity in an active window" },
  { label: "Burn-rate anomaly", value: "≥ 2x personal median hourly rate" },
  { label: "Stale-collector meta alert", value: "No reading in 6h" },
];

export function Settings() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [manualPlatform, setManualPlatform] = useState(PLATFORMS.find((p) => p.tier === "manual")?.id ?? "");
  const [manualValue, setManualValue] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const manualPlatforms = PLATFORMS.filter((p) => p.tier === "manual");

  function logReading() {
    if (!manualValue) return;
    setSavedMsg(`Logged ${manualValue}% for ${PLATFORMS.find((p) => p.id === manualPlatform)?.label} (mock — not persisted).`);
    setManualValue("");
    setTimeout(() => setSavedMsg(null), 3000);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Settings
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          API keys are mocked/local-only for now — no backend to send them to yet.
        </p>
      </div>

      <section className="rounded-xl border p-4" style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}>
        <h2 className="mb-3 font-semibold" style={{ color: "var(--text-primary)" }}>
          Quick manual log
        </h2>
        <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Gemini and Cursor have no API for consumer session/usage data yet — this is the primary
          data source for them per SPECS.md. Glance at the in-app banner, log the %, done in 2 seconds.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={manualPlatform}
            onChange={(e) => setManualPlatform(e.target.value)}
            className="rounded-md border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface-raised)", color: "var(--text-primary)" }}
          >
            {manualPlatforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            max={100}
            placeholder="% used"
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            className="w-24 rounded-md border px-2 py-1.5 text-sm tabular"
            style={{ borderColor: "var(--border)", background: "var(--surface-raised)", color: "var(--text-primary)" }}
          />
          <button
            onClick={logReading}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: "var(--series-blue)" }}
          >
            Log reading
          </button>
        </div>
        {savedMsg && (
          <div className="mt-2 text-xs" style={{ color: "var(--status-good)" }}>
            {savedMsg}
          </div>
        )}
      </section>

      <section className="rounded-xl border p-4" style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}>
        <h2 className="mb-3 font-semibold" style={{ color: "var(--text-primary)" }}>
          API keys / tokens
        </h2>
        <div className="flex flex-col gap-3">
          {PLATFORMS.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <label className="w-40 text-sm shrink-0" style={{ color: "var(--text-secondary)" }}>
                {p.label}
              </label>
              <input
                type="password"
                placeholder={p.tier === "official" ? "paste token…" : "no API available — manual log only"}
                disabled={p.tier === "manual"}
                value={keys[p.id] ?? ""}
                onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))}
                className="flex-1 rounded-md border px-2 py-1.5 text-sm disabled:opacity-50"
                style={{ borderColor: "var(--border)", background: "var(--surface-raised)", color: "var(--text-primary)" }}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border p-4" style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}>
        <h2 className="mb-1 font-semibold" style={{ color: "var(--text-primary)" }}>
          Alert thresholds
        </h2>
        <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Read-only for now — editable once the alert engine exists server-side.
        </p>
        <div className="flex flex-col gap-2 text-sm">
          {THRESHOLDS.map((t) => (
            <div key={t.label} className="flex items-center justify-between border-t pt-2" style={{ borderColor: "var(--border)" }}>
              <span style={{ color: "var(--text-secondary)" }}>{t.label}</span>
              <span className="tabular" style={{ color: "var(--text-primary)" }}>
                {t.value}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
