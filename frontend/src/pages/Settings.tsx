import { useState } from "react";
import { PLATFORMS } from "../data/mockData";
import { fetchConfigStatus, postManualLog, saveConfig, useFetch, type ConfigStatus } from "../lib/api";

const THRESHOLDS = [
  { label: "Approaching-limit warning", value: "70% used" },
  { label: "Approaching-limit critical", value: "90% used" },
  { label: "Idle allowance nudge", value: "45 min with no activity in an active window" },
  { label: "Burn-rate anomaly", value: "≥ 2x personal median hourly rate" },
  { label: "Stale-collector meta alert", value: "No reading in 6h" },
];

/** Only these platforms have a token this app's collectors actually read (see server/config.ts).
 * Gemini/Cursor stay manual-log-only per CLAUDE.md/SPECS.md — untouched, no config key for them. */
const CONFIG_KEY_BY_PLATFORM: Record<string, keyof ConfigStatus> = {
  vercel: "VERCEL_TOKEN",
  openai: "OPENAI_API_KEY",
  codex: "OPENAI_API_KEY", // Codex collector reads local CLI auth, not this field — see label override below.
};

export function Settings() {
  const { data: configStatus, reload: reloadConfig } = useFetch(fetchConfigStatus);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [manualPlatform, setManualPlatform] = useState(PLATFORMS.find((p) => p.tier === "manual")?.id ?? "");
  const [manualValue, setManualValue] = useState("");
  const [manualBusinessTag, setManualBusinessTag] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [keySavedMsg, setKeySavedMsg] = useState<string | null>(null);

  const manualPlatforms = PLATFORMS.filter((p) => p.tier === "manual");

  async function logReading() {
    if (!manualValue) return;
    try {
      await postManualLog({
        platform: manualPlatform,
        value: Number(manualValue),
        businessTag: manualBusinessTag.trim() || undefined,
      });
      const tagSuffix = manualBusinessTag.trim() ? ` for ${manualBusinessTag.trim()}` : "";
      setSavedMsg(
        `Logged ${manualValue}% for ${PLATFORMS.find((p) => p.id === manualPlatform)?.label}${tagSuffix}.`
      );
      setManualValue("");
      setManualBusinessTag("");
    } catch (err) {
      setSavedMsg(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTimeout(() => setSavedMsg(null), 4000);
  }

  async function saveKey(platformId: string) {
    const configKey = CONFIG_KEY_BY_PLATFORM[platformId];
    const value = keys[platformId];
    if (!configKey || value === undefined) return;
    try {
      await saveConfig({ [configKey]: value } as Partial<Record<keyof ConfigStatus, string>>);
      setKeySavedMsg(`Saved. Collectors will pick this up on their next scheduled run.`);
      setKeys((k) => ({ ...k, [platformId]: "" }));
      reloadConfig();
    } catch (err) {
      setKeySavedMsg(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTimeout(() => setKeySavedMsg(null), 4000);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Settings
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          API keys are written to a local git-ignored config file (data/local-config.json) by the
          API server — never committed, never logged. Requires <code>npm run server</code> running.
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
          <input
            type="text"
            placeholder="Business/project (optional)"
            value={manualBusinessTag}
            onChange={(e) => setManualBusinessTag(e.target.value)}
            className="w-48 rounded-md border px-2 py-1.5 text-sm"
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
          {PLATFORMS.map((p) => {
            const configKey = CONFIG_KEY_BY_PLATFORM[p.id];
            const isSet = configKey && configStatus ? configStatus[configKey] : false;
            const disabled = p.tier === "manual" || !configKey;
            const placeholder =
              p.id === "codex"
                ? "reads Codex CLI's own local login — nothing to paste here"
                : disabled
                  ? "no API available — manual log only"
                  : isSet
                    ? "•••••••• (saved — paste a new value to replace)"
                    : "paste token…";
            return (
              <div key={p.id} className="flex items-center gap-3">
                <label className="w-40 shrink-0 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {p.label}
                  {isSet && <span className="ml-1 text-xs" style={{ color: "var(--status-good)" }}>●</span>}
                </label>
                <input
                  type="password"
                  placeholder={placeholder}
                  disabled={disabled || p.id === "codex"}
                  value={keys[p.id] ?? ""}
                  onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))}
                  className="flex-1 rounded-md border px-2 py-1.5 text-sm disabled:opacity-50"
                  style={{ borderColor: "var(--border)", background: "var(--surface-raised)", color: "var(--text-primary)" }}
                />
                {!disabled && p.id !== "codex" && (
                  <button
                    onClick={() => saveKey(p.id)}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-white"
                    style={{ background: "var(--series-blue)" }}
                  >
                    Save
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {keySavedMsg && (
          <div className="mt-2 text-xs" style={{ color: "var(--status-good)" }}>
            {keySavedMsg}
          </div>
        )}
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Manual fallback if the UI can't reach the server: set the env var directly (
          <code>VERCEL_TOKEN</code>, <code>OPENAI_API_KEY</code>) before running{" "}
          <code>npm run collect:*</code>, or edit <code>data/local-config.json</code> by hand — see
          README.md.
        </p>
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
