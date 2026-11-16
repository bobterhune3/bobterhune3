"use client";

import { useState } from "react";
import Link from "next/link";
import type { SettingsPayload, TeamRow } from "@/src/lib/types";

async function call(path: string, passphrase: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-draft-passphrase": passphrase },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export function SettingsPanel() {
  const [passphrase, setPassphrase] = useState("");
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resetText, setResetText] = useState("");
  const [replace, setReplace] = useState(false);

  async function load() {
    setError("");
    const response = await fetch("/api/settings", { headers: { "x-draft-passphrase": passphrase } });
    const data = (await response.json().catch(() => ({}))) as SettingsPayload & { error?: string };
    if (!response.ok) {
      setError(data.error || "Could not open settings.");
      return;
    }
    setSettings(data);
  }

  function updateTeam(abbr: string, patch: Partial<TeamRow>) {
    setSettings((current) => current && ({ ...current, teams: current.teams.map((team) => team.abbr === abbr ? { ...team, ...patch } : team) }));
  }

  function move(index: number, direction: -1 | 1) {
    setSettings((current) => {
      if (!current) return current;
      const next = current.teams.slice();
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      const [row] = next.splice(index, 1);
      next.splice(target, 0, row);
      return { ...current, teams: next };
    });
  }

  async function save() {
    if (!settings) return;
    setError("");
    setMessage("");
    try {
      await call("/api/settings", passphrase, { passphrase, action: "save", ...settings, teams: settings.teams });
      setMessage("Saved.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed.");
    }
  }

  async function start() {
    setError("");
    setMessage("");
    try {
      const result = await call("/api/settings", passphrase, { passphrase, action: "start" }) as { mailError?: string };
      setMessage(result.mailError ? `Draft started. Email: ${result.mailError}` : "Draft started.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Start failed.");
    }
  }

  async function reset() {
    setError("");
    try {
      await call("/api/settings", passphrase, { passphrase, action: "reset", confirm: resetText });
      setResetText("");
      setMessage("Pick history cleared.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reset failed.");
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-name">NoDice <span>Taxi Squad settings</span></div>
          <Link href="/">Pick page</Link>
        </div>
      </header>
      <div className="settings">
        <section className="panel" style={{ padding: 16 }}>
          <h2>Passphrase</h2>
          <p className="hint">The same passphrase confirms a pick. It is the DRAFT_PASSPHRASE secret, not stored in the page.</p>
          <div className="inline" style={{ gridTemplateColumns: "1fr auto", marginTop: 8 }}>
            <input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="current-password" />
            <button type="button" className="primary" onClick={() => void load()}>Open</button>
          </div>
        </section>
        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="hint">{message}</p> : null}
        {settings ? (
          <>
            <section className="panel" style={{ padding: 16 }}>
              <h2>Draft</h2>
              <div className="rounds">
                <label className="search">Active
                  <select value={settings.active} onChange={(event) => setSettings({ ...settings, active: event.target.value })}>
                    <option value="off">Off</option>
                    <option value="taxi">Taxi Squad</option>
                    <option value="oifu">OIFU</option>
                  </select>
                </label>
                <label className="search">Season<input value={settings.season} onChange={(event) => setSettings({ ...settings, season: Number(event.target.value) })} /></label>
                <label className="search">National rounds<input disabled={settings.frozen} value={settings.roundsNational} onChange={(event) => setSettings({ ...settings, roundsNational: Number(event.target.value) })} /></label>
                <label className="search">American rounds<input disabled={settings.frozen} value={settings.roundsAmerican} onChange={(event) => setSettings({ ...settings, roundsAmerican: Number(event.target.value) })} /></label>
                <label className="search">Federal rounds<input disabled={settings.frozen} value={settings.roundsFederal} onChange={(event) => setSettings({ ...settings, roundsFederal: Number(event.target.value) })} /></label>
              </div>
              <p className="hint">{settings.frozen ? "Order, leagues, and round caps are frozen after pick 1." : "One email per manager is copied onto each of that manager's teams when you save."}</p>
              <p className="hint">Stats cache: {settings.cached} cached, {settings.missing} missing.</p>
              <div className="dialog-actions">
                <button type="button" className="primary" onClick={() => void save()}>Save</button>
                <button type="button" className="ghost" onClick={() => void start()}>Start draft</button>
                <button type="button" className="ghost" onClick={() => void call("/api/cache", passphrase, { passphrase }).then(() => load()).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Refresh failed."))}>Refresh MLB cache</button>
              </div>
            </section>
            <section className="panel" style={{ padding: 16 }}>
              <h2>Teams</h2>
              {settings.teams.map((team, index) => (
                <div key={team.abbr} className="team-row" style={{ marginTop: 8 }}>
                  <span className="count">{index + 1}</span>
                  <strong>{team.abbr}</strong>
                  <input aria-label={`${team.abbr} name`} value={team.name} onChange={(event) => updateTeam(team.abbr, { name: event.target.value })} />
                  <input aria-label={`${team.abbr} manager`} disabled={settings.frozen} value={team.manager} onChange={(event) => updateTeam(team.abbr, { manager: event.target.value })} />
                  <input aria-label={`${team.abbr} email`} value={team.email} onChange={(event) => updateTeam(team.abbr, { email: event.target.value })} placeholder="Email" />
                  <select aria-label={`${team.abbr} league`} disabled={settings.frozen} value={team.league} onChange={(event) => updateTeam(team.abbr, { league: event.target.value })}>
                    <option value="">League</option>
                    <option>National</option>
                    <option>American</option>
                    <option>Federal</option>
                  </select>
                  <input aria-label={`${team.abbr} logo`} value={team.logoUrl} onChange={(event) => updateTeam(team.abbr, { logoUrl: event.target.value })} placeholder="https logo" />
                  <span>
                    <button type="button" className="text-btn" disabled={settings.frozen} onClick={() => move(index, -1)}>Up</button>
                    <button type="button" className="text-btn" disabled={settings.frozen} onClick={() => move(index, 1)}>Down</button>
                  </span>
                </div>
              ))}
            </section>
            <section className="panel" style={{ padding: 16 }}>
              <h2>Roster file</h2>
              <form onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                data.set("passphrase", passphrase);
                if (replace) data.set("replace", "1");
                void fetch("/api/roster", { method: "POST", body: data, headers: { "x-draft-passphrase": passphrase } })
                  .then(async (response) => {
                    const body = (await response.json()) as { error?: string; count?: number };
                    if (!response.ok) throw new Error(body.error || "Upload failed.");
                    setMessage(`Loaded ${body.count} players.`);
                    await load();
                  })
                  .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Upload failed."));
              }}>
                <input name="file" type="file" accept=".csv,text/csv" required />
                <label className="hint"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} /> Replace roster and reset picks</label>
                <button type="submit" className="ghost">Upload</button>
              </form>
            </section>
            <section className="panel" style={{ padding: 16 }}>
              <h2>Email retries</h2>
              {settings.mailFailures.length === 0 ? <p className="hint">No failed messages.</p> : settings.mailFailures.map((item) => (
                <div key={item.pickNumber} className="mail-row">
                  <span>{item.pickNumber === 0 ? "Opening notice" : `After pick ${item.pickNumber}`}: {item.error}</span>
                  <button type="button" className="ghost" onClick={() => void call("/api/email", passphrase, { passphrase, pickNumber: item.pickNumber }).then(() => load()).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Send failed."))}>Send again</button>
                </div>
              ))}
            </section>
            <section className="panel" style={{ padding: 16 }}>
              <h2>Reset draft</h2>
              <p className="hint">Clears picks and the email log. Teams, leagues, order, and addresses stay.</p>
              <div className="inline" style={{ gridTemplateColumns: "1fr auto" }}>
                <input value={resetText} onChange={(event) => setResetText(event.target.value)} placeholder="Type RESET" />
                <button type="button" className="ghost" onClick={() => void reset()}>Reset picks</button>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
