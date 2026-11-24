"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PickBoard } from "@/components/pick-board";
import { mlbLogoUrl } from "@/src/lib/logos";
import { headshotUrl } from "@/src/lib/positions";
import type { Board, OifuPerson, OifuTeam } from "@/src/lib/types";

export function OifuApp({ initial }: { initial: Board }) {
  const [board, setBoard] = useState(initial);
  if (board.oifu?.phase === "pick") return <PickBoard initial={board} kind="oifu" onSwitch={setBoard} />;
  return <DeclareBoard initial={board} onSwitch={setBoard} />;
}

function DeclareBoard({ initial, onSwitch }: { initial: Board; onSwitch: (board: Board) => void }) {
  const [board, setBoard] = useState(initial);
  const [q, setQ] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [selected, setSelected] = useState<OifuPerson | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [manager, setManager] = useState("All");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmJoin, setConfirmJoin] = useState(false);

  async function load(nextQ = q) {
    const params = new URLSearchParams({ draft: "oifu", q: nextQ, filter: "All", page: "1" });
    const response = await fetch(`/api/board?${params}`);
    if (!response.ok) return;
    const data = (await response.json()) as Board;
    if (data.oifu?.phase === "pick") {
      onSwitch(data);
      return;
    }
    setBoard(data);
    setSelected((current) => (current && data.oifu?.roster.some((player) => player.mlbid === current.mlbid) ? current : current && nextQ === q ? current : null));
  }

  useEffect(() => {
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => window.clearInterval(timer);
  });

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const response = await fetch("/api/oifu", {
      method: "POST",
      headers: { "content-type": "application/json", "x-draft-passphrase": passphrase },
      body: JSON.stringify({ ...body, passphrase }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(data.error || "That was not saved.");
      await load();
      return;
    }
    setConfirmJoin(false);
    setSelected(null);
    setChecked([]);
    await load();
  }

  const view = board.oifu;
  const clock = board.clock;
  const phase = view?.phase ?? "idle";
  const managers = [...new Set((view?.openTeams ?? []).map((team) => team.manager))];
  const visible = (view?.openTeams ?? []).filter((team) => manager === "All" || team.manager === manager);
  const ready = passphrase.trim().length > 0 && board.passphraseConfigured && !busy;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-name">NoDice <span>OIFU</span></div>
          <Link href="/settings">Settings</Link>
        </div>
        <div className="turn" aria-live="polite">
          {phase === "ended" || clock.finished ? (
            <div>
              <h1>OIFU draft complete</h1>
              <p className="next-line">Every pick is off the Taxi Squad board.</p>
            </div>
          ) : phase === "stall" ? (
            <div>
              <h1>No teams joined round {view?.round}</h1>
              <p className="next-line">End the draft, or open another round.</p>
            </div>
          ) : phase === "declare" ? (
            <>
              <div className="current">
                <p className="current-label">Declaring:</p>
                <div className="current-line">
                  {clock.abbr ? <Logo abbr={clock.abbr} name={clock.team} /> : null}
                  <h1>{clock.manager}, {clock.team}</h1>
                </div>
                <p className="next-line">{clock.nextTeam ? `Next to declare, ${clock.nextManager}, ${clock.nextTeam}` : "Last team to declare this round."}</p>
              </div>
              <div className="meta">
                <p className="round">Round {view?.round} · from the bottom</p>
                <p className="status-chip">Drop a player to join, or skip.</p>
              </div>
            </>
          ) : (
            <div>
              <h1>{clock.closed ? "OIFU is closed" : "OIFU is ready"}</h1>
              <p className="next-line">{clock.message}</p>
            </div>
          )}
        </div>
      </header>
      {board.mailProblem ? <p className="banner">A notice was saved, and its email did not go out.</p> : null}
      <main className="board">
        <section className="panel" aria-label="Declare for this round">
          <div className="panel-head"><h2>{phase === "declare" ? "Join this round" : phase === "stall" ? "Round is open" : "OIFU"}</h2></div>
          <div className="composer-body">
            {phase === "declare" ? (
              <>
                <p className="hint">Drop a player from the {clock.team} roster. That player enters the pool, and this team drafts when the round turns around.</p>
                <div className={selected ? "slot filled" : "slot"}>
                  {selected ? (
                    <div className="slot-player">
                      <Head mlbid={selected.mlbid} name={selected.name} />
                      <div>
                        <div className="name">{selected.name} <span className="hand">({selected.bats})</span></div>
                        <p className="slot-for">{selected.pos} · {clock.team}</p>
                      </div>
                      <button type="button" className="text-btn" onClick={() => setSelected(null)}>Clear</button>
                    </div>
                  ) : (
                    <div>
                      <p className="slot-title">Choose a roster player</p>
                      <p className="slot-help">Type a name, then select a match</p>
                    </div>
                  )}
                </div>
              </>
            ) : phase === "stall" ? (
              <p className="hint">Nobody dropped a player for round {view?.round}. Ending sends one last email to the managers.</p>
            ) : phase === "ended" ? (
              <p className="hint">The draft is closed. Reset it from Settings if you need to run it again.</p>
            ) : (
              <p className="hint">Each round starts at the bottom of the order. A team drops one of its own players to join, skips the round, or leaves the draft. Then the teams that joined pick from the players that were dropped.</p>
            )}
            <form className="search-form" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
              <label className="search"><span>Passphrase</span><input type="password" name="draft-passphrase" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="off" /></label>
            </form>
            {!board.passphraseConfigured ? <p className="hint">Add DRAFT_PASSPHRASE before anyone can take a turn.</p> : null}
            {phase === "declare" ? (
              <div className="dialog-actions">
                <button type="button" className="primary" disabled={!ready || !selected} onClick={() => { setError(""); setConfirmJoin(true); }}>Join Round</button>
                <button type="button" className="ghost" disabled={!ready} onClick={() => { if (window.confirm(`${clock.team} skips round ${view?.round}? No player is dropped.`)) void act({ action: "skip" }); }}>Skip this round</button>
                <button type="button" className="ghost" disabled={!ready} onClick={() => { if (window.confirm(`${clock.team} withdraws from the OIFU draft? They sit out every remaining round.`)) void act({ action: "withdraw" }); }}>Withdraw from draft</button>
              </div>
            ) : null}
            {phase === "stall" ? (
              <div className="dialog-actions">
                <button type="button" className="primary" disabled={!ready || !view?.canEnd} onClick={() => { if (window.confirm("End the OIFU draft and email the managers?")) void act({ action: "end" }); }}>End the draft</button>
                {view?.canContinue ? <button type="button" className="ghost" disabled={!ready} onClick={() => { if (window.confirm("Open another declaration round?")) void act({ action: "continue" }); }}>Open another round</button> : null}
              </div>
            ) : null}
            {error ? <p className="error">{error}</p> : null}
            {phase === "ended" && board.picks.length > 0 ? (
              <ol className="steps">
                {board.picks.slice().reverse().map((pick) => <li key={pick.pick}>{pick.pick}. {pick.team}, {pick.manager}, {pick.name}, {pick.pos}</li>)}
              </ol>
            ) : null}
          </div>
        </section>
        <section className="panel" aria-label="Team roster">
          <div className="panel-head"><h2>{phase === "declare" ? `${clock.team} roster` : "Roster"}</h2><span className="count">{view?.roster.length ?? 0}</span></div>
          {phase === "declare" ? (
            <form className="search-form" role="search" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
              <label className="search"><span>Find a player</span><input type="search" name="roster-search" value={q} onChange={(event) => { setQ(event.target.value); setSelected(null); void load(event.target.value); }} placeholder="Type a name" autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="Find a roster player" /></label>
            </form>
          ) : null}
          <p className="board-hint">{phase === "declare" ? (q.trim() ? `Names containing “${q.trim()}” on this roster.` : "Type a name to see this team’s players.") : "Matches show up when a team is declaring."}</p>
          <div className="list">
            {phase === "declare" && q.trim() && (view?.roster.length ?? 0) === 0 ? <div className="empty">No roster players match.</div> : null}
            {(view?.roster ?? []).map((player) => (
              <div key={player.mlbid} role="button" tabIndex={0} className={selected?.mlbid === player.mlbid ? "card selected" : "card"} onClick={() => setSelected(player)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(player); } }}>
                <Head mlbid={player.mlbid} name={player.name} />
                <div>
                  <div className="name-line">
                    <span className="name">{player.name} <span className="hand">({player.bats})</span></span>
                    <span className="pos">{player.pos}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
        <aside className="panel rail" aria-label="Round status">
          {phase === "declare" ? (
            <details className="rail-next" open>
              <summary><span className="panel-title">Skip ahead</span><span className="count">{checked.length}</span></summary>
              <div className="rail-list" style={{ padding: "0 14px 12px" }}>
                <p className="rail-note">Check the teams that will sit this round out. One note goes out, not one email per team.</p>
                <div className="chip-row">
                  <button type="button" className="chip" aria-pressed={manager === "All"} onClick={() => setManager("All")}>All</button>
                  {managers.map((name) => <button key={name} type="button" className="chip" aria-pressed={manager === name} onClick={() => setManager(name)}>{name}</button>)}
                </div>
                <div className="rail-scroll">
                  {visible.map((team) => (
                    <label key={team.abbr} className="check-row">
                      <input type="checkbox" checked={checked.includes(team.abbr)} onChange={(event) => setChecked((current) => event.target.checked ? [...current, team.abbr] : current.filter((abbr) => abbr !== team.abbr))} />
                      <span>{team.team}</span>
                      <span className="pick-pos">{team.manager}{team.abbr === clock.abbr ? " · on the clock" : ""}</span>
                    </label>
                  ))}
                </div>
                <button type="button" className="ghost" disabled={!ready || checked.length === 0} onClick={() => { if (window.confirm(`Skip ${checked.length} ${checked.length === 1 ? "team" : "teams"} for this round?`)) void act({ action: "skip-many", abbrs: checked }); }}>Skip checked teams</button>
              </div>
            </details>
          ) : null}
          <details className="rail-picks" open>
            <summary><span className="panel-title">In the pool</span><span className="count">{view?.drops.length ?? 0}</span></summary>
            <p className="rail-note">Dropped, and not yet picked</p>
            <div className="rail-list">
              {(view?.drops.length ?? 0) === 0 ? <div className="empty">No players dropped yet.</div> : view?.drops.map((drop) => (
                <article key={drop.mlbid} className="pick-row">
                  <div className="pick-num">{drop.round}</div>
                  <Logo abbr={drop.abbr} name={drop.team} />
                  <Head mlbid={drop.mlbid} name={drop.name} />
                  <div><div className="pick-name">{drop.name} ({drop.bats})</div><div className="pick-pos">{drop.pos} · {drop.team}</div></div>
                </article>
              ))}
            </div>
          </details>
          <details className="rail-current" open>
            <summary><span className="panel-title">Still to declare</span><span className="count">{view?.waiting.length ?? 0}</span></summary>
            <div className="rail-list rail-scroll">
              {(view?.waiting.length ?? 0) === 0 ? <div className="empty">No teams left in line.</div> : view?.waiting.map((team, index) => <TeamLine key={team.abbr} team={team} n={index + 1} />)}
            </div>
          </details>
          {(view?.skipped.length ?? 0) > 0 ? <p className="rail-note">Sitting out: {view?.skipped.map((team) => team.team).join(", ")}</p> : null}
          {(view?.withdrawn.length ?? 0) > 0 ? <p className="rail-note">Out of the draft: {view?.withdrawn.map((team) => `${team.team} (${team.manager})`).join(", ")}</p> : null}
        </aside>
      </main>
      {confirmJoin && selected ? (
        <div className="backdrop" onClick={(event) => { if (event.target === event.currentTarget) setConfirmJoin(false); }}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="join-title">
            <h2 id="join-title">Join round {view?.round}</h2>
            <p className="hint">{clock.team}, {clock.manager} drops {selected.name}, {selected.pos}.</p>
            {error ? <p className="error">{error}</p> : <p className="fine">The other managers get one email listing every player dropped this round.</p>}
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setConfirmJoin(false)}>Cancel</button>
              <button type="button" className="primary" disabled={busy} onClick={() => void act({ action: "join", mlbid: selected.mlbid })}>Join Round</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TeamLine({ team, n }: { team: OifuTeam; n: number }) {
  return (
    <article className="next-row">
      <div className="pick-num">{n}</div>
      <Logo abbr={team.abbr} name={team.team} />
      <div>
        <div className="pick-name">{team.team}</div>
        <div className="pick-pos">{team.manager}</div>
      </div>
    </article>
  );
}

function Logo({ abbr, name }: { abbr: string; name: string }) {
  const src = mlbLogoUrl(abbr);
  if (!src) return <div className="tmark" title={name}>{abbr}</div>;
  return <img className="team-logo" alt="" title={name} src={src} />;
}

function Head({ mlbid, name }: { mlbid: string; name: string }) {
  return <img className="head" alt="" src={headshotUrl(mlbid)} />;
}
