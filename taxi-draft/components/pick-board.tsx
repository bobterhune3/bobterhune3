"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { mlbLogoUrl } from "@/src/lib/logos";
import { FILTERS, headshotUrl } from "@/src/lib/positions";
import type { Board, PlayerCard } from "@/src/lib/types";

const MARK: Record<string, string> = {
  ANM: "#ba0021", AZB: "#a71930", ATM: "#ce1141", BLN: "#df4601", BSM: "#bd3039", CHB: "#0e3386",
  CLM: "#e31937", DTB: "#0c2340", HSN: "#eb6e1f", KCM: "#004687", LAN: "#005a9c", MLG: "#12284b",
  MNB: "#002b5c", NYB: "#132448", PHN: "#e81828", PTN: "#fdb827", SDG: "#2f241d", SFN: "#fd5a1e",
  SEG: "#0c2c56", SLB: "#c41e3a", TBM: "#092c5c", TXG: "#003278", TOG: "#134a8e", WSG: "#ab0003",
};

function ink(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#1a1408" : "#fff";
}

function TeamLogo({ abbr, name }: { abbr: string; name: string }) {
  const src = mlbLogoUrl(abbr);
  const color = MARK[abbr] || "#334155";
  if (!src) return <div className="tmark" style={{ background: color, color: ink(color) }} title={name}>{abbr}</div>;
  return (
    <img
      className="team-logo"
      alt={name}
      title={name}
      src={src}
      onError={(event) => {
        const mark = document.createElement("div");
        mark.className = "tmark";
        mark.title = name;
        mark.textContent = abbr;
        mark.style.background = color;
        mark.style.color = ink(color);
        event.currentTarget.replaceWith(mark);
      }}
    />
  );
}

function Head({ mlbid, name }: { mlbid: string; name: string }) {
  const letters = name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <img className="head" alt="" draggable={false} src={headshotUrl(mlbid)} onError={(event) => { event.currentTarget.replaceWith(Object.assign(document.createElement("div"), { className: "head", textContent: letters })); }} />;
}

export function PickBoard({ initial }: { initial: Board }) {
  const [board, setBoard] = useState(initial);
  const [filter, setFilter] = useState(initial.filter || "All");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PlayerCard | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const draggingId = useRef("");
  const searching = q.trim().length >= 3;

  async function load(next = { filter, q, page }) {
    const params = new URLSearchParams({ filter: next.filter, q: next.q, page: String(next.page) });
    const response = await fetch(`/api/board?${params}`);
    if (!response.ok) return;
    const data = (await response.json()) as Board;
    setBoard(data);
    setPage(data.page);
    setSelected((current) => (current && data.picks.some((pick) => pick.mlbid === current.mlbid) ? null : current));
  }

  useEffect(() => {
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => window.clearInterval(timer);
  });

  function choose(player: PlayerCard) {
    if (board.clock.closed || board.clock.finished) return;
    setSelected(player);
    setError("");
  }

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/pick", {
      method: "POST",
      headers: { "content-type": "application/json", "x-draft-passphrase": passphrase },
      body: JSON.stringify({ mlbid: selected.mlbid, passphrase }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; mailError?: string };
    setBusy(false);
    if (!response.ok) {
      setError(data.error || "That pick was not saved.");
      await load();
      return;
    }
    setOpen(false);
    setSelected(null);
    await load();
  }

  const clock = board.clock;
  const canPick = Boolean(selected) && clock.started && !clock.closed && !clock.finished && board.passphraseConfigured && passphrase.trim().length > 0;
  const pickHold = clock.closed
    ? "The draft is closed."
    : clock.finished
      ? "The draft is complete."
      : !clock.started
        ? "Start the draft in Settings. Pick stays off until then."
        : !selected
          ? "Put a player in the slot."
          : passphrase.trim().length === 0
            ? "Type the shared passphrase."
            : "";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-name">NoDice <span>Taxi Squad</span></div>
          <Link href="/settings">Settings</Link>
        </div>
        <div className="turn" aria-live="polite">
          {clock.closed || clock.finished ? (
            <div>
              <h1>{clock.finished ? "Draft complete" : "Draft is closed"}</h1>
              <p className="next-line">{clock.message}</p>
            </div>
          ) : (
            <>
              <div className="current">
                <p className="current-label">Current Pick:</p>
                <div className="current-line">
                  {clock.abbr ? <TeamLogo abbr={clock.abbr} name={clock.team} /> : null}
                  <h1>{clock.manager}, {clock.team}</h1>
                </div>
                <p className="next-line">{clock.endsAfter ? "The draft ends after this pick." : `Next pick, ${clock.nextManager}, ${clock.nextTeam}`}</p>
              </div>
              <div className="meta">
                <p className="round">Round {clock.round}, Pick {clock.pick}</p>
                <p className="league">{clock.league || "League not set"}</p>
                {clock.message ? <p className="status-chip">{clock.message}</p> : null}
              </div>
            </>
          )}
        </div>
      </header>
      {board.mailProblem ? <p className="banner">A pick is saved, and its email did not go out. Retry it from Settings.</p> : null}
      <main className="board">
        <section className="panel" aria-label="Make a pick">
          <div className="panel-head"><h2>Make a pick</h2></div>
          <div className="composer-body">
            <div
              className={selected ? "slot filled" : "slot"}
              onDragEnter={(event) => { event.preventDefault(); }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; event.currentTarget.classList.add("over"); }}
              onDragLeave={(event) => event.currentTarget.classList.remove("over")}
              onDrop={(event) => {
                event.preventDefault();
                event.currentTarget.classList.remove("over");
                const id = event.dataTransfer.getData("text/plain") || draggingId.current;
                const player = board.players.find((item) => item.mlbid === id);
                if (player) choose(player);
              }}
            >
              {selected ? (
                <div className="slot-player">
                  <Head mlbid={selected.mlbid} name={selected.name} />
                  <div>
                    <div className="name">{selected.name}</div>
                    {selected.rating ? <p className="rating">{selected.rating}</p> : null}
                    <p className="slot-for">{clock.team} · {clock.manager}</p>
                  </div>
                  <button type="button" className="text-btn" onClick={() => setSelected(null)}>Clear</button>
                </div>
              ) : (
                <div>
                  <p className="slot-title">Drop a player here</p>
                  <p className="slot-help">or select a row</p>
                </div>
              )}
            </div>
            <form className="search-form" role="search" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
              <label className="search"><span>Search</span><input type="search" name="player-search" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); void load({ filter, q: event.target.value, page: 1 }); }} placeholder="Search players" autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" aria-label="Search players" /></label>
            </form>
            <p className="hint">Filters the list after 3 letters.</p>
            <form className="search-form" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
              <label className="search"><span>Passphrase</span><input type="password" name="draft-passphrase" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="off" /></label>
            </form>
            {!board.passphraseConfigured ? <p className="hint">Add DRAFT_PASSPHRASE before anyone can pick.</p> : null}
            <button type="button" className="primary" disabled={!canPick} onClick={() => { setError(""); setOpen(true); }}>Pick</button>
            {pickHold ? <p className="hint">{pickHold}</p> : null}
            <ol className="steps">
              <li>Drag a player into the slot, or select a row.</li>
              <li>Press Pick.</li>
              <li>Confirm the team, manager, and player.</li>
            </ol>
            <p className="fine">Confirm saves the pick. Each manager gets one email when Gmail is configured.</p>
          </div>
        </section>
        <section className="panel" aria-label="Available players">
          <div className="panel-head"><h2>Available</h2><span className="count">{board.availableCount} available</span></div>
          <div className={searching ? "chips paused" : "chips"} role="toolbar" aria-label="Position filters">
            {FILTERS.map((name) => (
              <button key={name} type="button" className="chip" aria-pressed={filter === name} onClick={() => { setFilter(name); setPage(1); void load({ filter: name, q, page: 1 }); }}>{name}</button>
            ))}
          </div>
          <p className="board-hint">{searching ? `Names containing “${q.trim()}”. Position filters are paused.` : filter === "All" ? "Alphabetical. 10 per page." : filter}</p>
          <div className="list">
            {board.players.length === 0 ? <div className="empty">No players match.</div> : board.players.map((player) => (
              <div
                key={player.mlbid}
                role="button"
                tabIndex={0}
                className={selected?.mlbid === player.mlbid ? "card selected" : "card"}
                draggable
                onDragStart={(event) => {
                  draggingId.current = player.mlbid;
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData("text/plain", player.mlbid);
                  document.body.classList.add("dragging");
                }}
                onDragEnd={() => {
                  document.body.classList.remove("dragging");
                  window.setTimeout(() => { draggingId.current = ""; }, 50);
                }}
                onClick={() => choose(player)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(player); } }}
              >
                <Head mlbid={player.mlbid} name={player.name} />
                <div>
                  <div className="name-line">
                    <span className="name">{player.name} <span className="hand">({player.bats})</span></span>
                    <span className={player.kind === "P" ? "pos pitch" : "pos"}>{player.pos}</span>
                  </div>
                  <p className="season-line">{player.timeLabel} {player.playingTime || "—"}</p>
                  {player.rating ? <p className="rating">{player.rating}</p> : null}
                  {player.field ? <p className="field">{player.field}</p> : null}
                </div>
                <table className="splits">
                  <thead><tr><th /><th>{player.kind === "P" ? "BAA" : "AVG"}</th><th>OPS</th><th>HR</th></tr></thead>
                  <tbody>
                    <tr><th scope="row">VSL</th><td>{player.vsl?.avg || ""}</td><td>{player.vsl?.ops || ""}</td><td>{player.vsl?.hr || ""}</td></tr>
                    <tr><th scope="row">VSR</th><td>{player.vsr?.avg || ""}</td><td>{player.vsr?.ops || ""}</td><td>{player.vsr?.hr || ""}</td></tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <div className="pager">
            <button type="button" disabled={page <= 1} onClick={() => void load({ filter, q, page: page - 1 })}>Previous</button>
            <span className="count">{board.matchCount === 0 ? "0 players" : `${(page - 1) * 10 + 1}–${Math.min(page * 10, board.matchCount)} of ${board.matchCount}`}</span>
            <button type="button" disabled={page >= board.pageCount} onClick={() => void load({ filter, q, page: page + 1 })}>Next</button>
          </div>
        </section>
        <aside className="panel rail" aria-label="Draft order">
          <details className="rail-picks" open>
            <summary><span className="panel-title">Picks so far</span><span className="count">{board.picks.length}</span></summary>
            <p className="rail-note">Newest first</p>
            <div className="rail-list">
              {board.picks.length === 0 ? <div className="empty">No picks yet.</div> : board.picks.map((pick) => (
                <article key={pick.pick} className="pick-row">
                  <div className="pick-num">{pick.pick}</div>
                  <TeamLogo abbr={pick.abbr} name={pick.team} />
                  <Head mlbid={pick.mlbid} name={pick.name} />
                  <div><div className="pick-name">{pick.name} ({pick.bats})</div><div className="pick-pos">{pick.pos}</div></div>
                </article>
              ))}
            </div>
          </details>
          <details className="rail-current" open>
            <summary><span className="panel-title">Current Pick</span><span className="count">{clock.team && !clock.closed && !clock.finished ? 1 : 0}</span></summary>
            <div className="rail-list">
              {clock.team && !clock.closed && !clock.finished ? (
                <article className="next-row">
                  <div className="pick-num">{clock.pick}</div>
                  <TeamLogo abbr={clock.abbr} name={clock.team} />
                  <div>
                    <div className="pick-name">{clock.team}</div>
                    <div className="pick-pos">{clock.manager} · Round {clock.round}</div>
                  </div>
                </article>
              ) : (
                <div className="empty">No team is on the clock.</div>
              )}
            </div>
          </details>
          <details className="rail-next" open>
            <summary><span className="panel-title">Next picks</span><span className="count">{board.upcoming.length}</span></summary>
            <div className="rail-list">
              {board.upcoming.length === 0 ? <div className="empty">No picks left.</div> : board.upcoming.map((slot) => (
                <article key={slot.pick} className="next-row">
                  <div className="pick-num">{slot.pick}</div>
                  <TeamLogo abbr={slot.abbr} name={slot.team} />
                  <div>
                    <div className="pick-name">{slot.team}</div>
                    <div className="pick-pos">{slot.manager} · Round {slot.round}</div>
                  </div>
                </article>
              ))}
            </div>
          </details>
        </aside>
      </main>
      {open && selected ? (
        <div className="backdrop" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title">Confirm this pick</h2>
            <p className="hint">Round {clock.round}, Pick {clock.pick}</p>
            <dl className="facts">
              <div><dt>Team</dt><dd>{clock.team}</dd></div>
              <div><dt>Manager</dt><dd>{clock.manager}</dd></div>
              <div><dt>Player</dt><dd>{selected.name} ({selected.bats}), {selected.pos}</dd></div>
            </dl>
            {error ? <p className="error">{error}</p> : <p className="fine">Confirm updates the shared draft.</p>}
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="primary" disabled={busy} onClick={() => void confirm()}>Confirm</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
