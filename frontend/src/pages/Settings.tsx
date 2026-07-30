import { useState } from "react";
import { fetchConfigStatus, saveConfig, useFetch, type ConfigStatus } from "../lib/api";

const THRESHOLDS = [
  { label: "Approaching-limit warning", value: "70% used" },
  { label: "Approaching-limit critical", value: "90% used" },
  { label: "Idle allowance nudge", value: "45 min with no activity in an active window" },
  { label: "Burn-rate anomaly", value: "≥ 2x personal median hourly rate" },
  { label: "Stale-collector meta alert", value: "No reading in 6h" },
];

const CONFIG_FIELDS: Array<{
  key: keyof ConfigStatus;
  platform: string;
  label: string;
  placeholder: string;
  secret?: boolean;
}> = [
  {
    key: "VERCEL_TOKEN",
    platform: "Vercel",
    label: "Personal access token",
    placeholder: "VERCEL_TOKEN",
    secret: true,
  },
  {
    key: "VERCEL_TEAM_ID",
    platform: "Vercel",
    label: "Team ID (optional)",
    placeholder: "VERCEL_TEAM_ID",
  },
  {
    key: "OPENAI_API_KEY",
    platform: "OpenAI",
    label: "API key",
    placeholder: "OPENAI_API_KEY",
    secret: true,
  },
  {
    key: "CODEX_HOME",
    platform: "ChatGPT / Codex",
    label: "CLI home (optional)",
    placeholder: "Defaults to ~/.codex",
  },
  {
    key: "GOOGLE_APPLICATION_CREDENTIALS",
    platform: "Gemini",
    label: "Service-account JSON path",
    placeholder: "GOOGLE_APPLICATION_CREDENTIALS",
  },
  {
    key: "GEMINI_GCP_PROJECT_ID",
    platform: "Gemini",
    label: "GCP project ID",
    placeholder: "GEMINI_GCP_PROJECT_ID",
  },
];

export function Settings() {
  const {
    data: configStatus,
    loading: configLoading,
    error: configError,
    reload: reloadConfig,
  } = useFetch(fetchConfigStatus);
  const [values, setValues] = useState<Partial<Record<keyof ConfigStatus, string>>>({});
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  async function saveField(configKey: keyof ConfigStatus) {
    const value = values[configKey];
    if (!value) return;

    try {
      await saveConfig({ [configKey]: value });
      setSavedMessage("Saved. Collectors will use it on their next scheduled run.");
      setValues((current) => ({ ...current, [configKey]: "" }));
      reloadConfig();
    } catch (err) {
      setSavedMessage(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTimeout(() => setSavedMessage(null), 4000);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Settings
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Collector credentials are written to <code>data/local-config.json</code>, which is
          gitignored. Existing values are never returned to the browser. Requires{" "}
          <code>npm run server</code>.
        </p>
      </div>

      <section
        className="rounded-xl border p-4"
        style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}
      >
        <h2 className="mb-1 font-semibold" style={{ color: "var(--text-primary)" }}>
          Integration availability
        </h2>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <div className="font-medium" style={{ color: "var(--text-primary)" }}>
              Gemini
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              Real API quota data through Google Cloud Monitoring once a Monitoring Viewer service
              account and GCP project ID are configured below. No manual fallback.
            </div>
          </div>
          <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <div className="font-medium" style={{ color: "var(--text-primary)" }}>
              Cursor
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              Not connected — no API available on individual plans. Cursor's Admin API requires a
              Team, Business, or Enterprise plan, so no usage data or manual substitute is shown.
            </div>
          </div>
        </div>
      </section>

      <section
        className="rounded-xl border p-4"
        style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}
      >
        <h2 className="mb-3 font-semibold" style={{ color: "var(--text-primary)" }}>
          Collector configuration
        </h2>
        <div className="flex flex-col gap-3">
          {CONFIG_FIELDS.map((field) => {
            const isSet = configStatus?.[field.key] ?? false;
            return (
              <div
                key={field.key}
                className="grid gap-1 sm:grid-cols-[9rem_11rem_1fr_auto] sm:items-center sm:gap-3"
              >
                <div className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  {field.platform}
                  {isSet && (
                    <span className="ml-1 text-xs" style={{ color: "var(--status-good)" }}>
                      ●
                    </span>
                  )}
                </div>
                <label
                  className="text-xs"
                  htmlFor={field.key}
                  style={{ color: "var(--text-muted)" }}
                >
                  {field.label}
                </label>
                <input
                  id={field.key}
                  type={field.secret ? "password" : "text"}
                  placeholder={
                    isSet ? "Configured — enter a new value to replace" : field.placeholder
                  }
                  value={values[field.key] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  className="min-w-0 rounded-md border px-2 py-1.5 text-sm"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--surface-raised)",
                    color: "var(--text-primary)",
                  }}
                />
                <button
                  onClick={() => void saveField(field.key)}
                  disabled={!values[field.key]}
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                  style={{ background: "var(--series-blue)" }}
                >
                  Save
                </button>
              </div>
            );
          })}
        </div>
        {configLoading && (
          <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Checking saved configuration…
          </div>
        )}
        {configError && (
          <div className="mt-2 text-xs" style={{ color: "var(--status-critical)" }}>
            Could not read configuration status: {configError}
          </div>
        )}
        {savedMessage && (
          <div className="mt-2 text-xs" style={{ color: "var(--status-good)" }}>
            {savedMessage}
          </div>
        )}
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          If the UI cannot reach the server, set the same environment variables before running{" "}
          <code>npm run collect:*</code>, or edit <code>data/local-config.json</code> directly.
          This is a credential setup fallback, not a manual usage-log path.
        </p>
      </section>

      <section
        className="rounded-xl border p-4"
        style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}
      >
        <h2 className="mb-1 font-semibold" style={{ color: "var(--text-primary)" }}>
          Alert thresholds
        </h2>
        <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Read-only for now — editable once the alert engine exists server-side.
        </p>
        <div className="flex flex-col gap-2 text-sm">
          {THRESHOLDS.map((threshold) => (
            <div
              key={threshold.label}
              className="flex items-center justify-between border-t pt-2"
              style={{ borderColor: "var(--border)" }}
            >
              <span style={{ color: "var(--text-secondary)" }}>{threshold.label}</span>
              <span className="tabular" style={{ color: "var(--text-primary)" }}>
                {threshold.value}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
