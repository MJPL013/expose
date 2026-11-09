"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Maximize2, Minus, Plus, RefreshCw } from "lucide-react";
import type { Core, ElementDefinition } from "cytoscape";
import type { GraphView } from "@expose/shared/gc2-graph";
import { api } from "./client";
import { usePlayerPreferences } from "../src/session/provider";
import styles from "./explorer.module.css";
const EMPTY: GraphView = {
  version: 1,
  nodes: [],
  edges: [],
  clusters: [],
  exploratory: true,
};
export function StoryExplorer() {
  const { theme } = usePlayerPreferences();
  const [data, setData] = useState(EMPTY),
    [provenance, setProvenance] = useState("synthetic"),
    [person, setPerson] = useState(""),
    [session, setSession] = useState(""),
    [query, setQuery] = useState("");
  const [cluster, setCluster] = useState("");
  const [view, setView] = useState<"experience" | "response">("experience"),
    [selected, setSelected] = useState(""),
    [expanded, setExpanded] = useState<string[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0);
  const container = useRef<HTMLDivElement>(null),
    cy = useRef<Core | null>(null);
  useEffect(() => {
    let active = true;
    void api<GraphView>(`/admin/graph?provenance=${provenance}`)
      .then((value) => {
        if (active) {
          setData(value);
          setError("");
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setData(EMPTY);
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [provenance, refresh]);
  const people = useMemo(
    () => [
      ...new Map(data.nodes.map((n) => [n.personId, n.personName])).entries(),
    ],
    [data],
  );
  const sessions = useMemo(
    () => [
      ...new Set(
        data.nodes
          .filter((n) => !person || n.personId === person)
          .map((n) => n.sessionId),
      ),
    ],
    [data, person],
  );
  const nodes = useMemo(
    () =>
      data.nodes.filter(
        (n) =>
          (!person || n.personId === person) &&
          (!session || n.sessionId === session) &&
          (!cluster ||
            data.clusters
              .find((c) => c.id === cluster)
              ?.nodeIds.includes(n.id)) &&
          (!query ||
            `${n.title} ${n.summary}`
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase())),
      ),
    [data, person, session, query, cluster],
  );
  const visible = useMemo(() => nodes.slice(0, 500), [nodes]);
  const ids = useMemo(() => new Set(visible.map((n) => n.id)), [visible]);
  const edges = useMemo(
    () =>
      data.edges.filter(
        (e) =>
          ids.has(e.from) &&
          ids.has(e.to) &&
          (view === "experience"
            ? ["related-experience", "continues"]
            : ["similar-response"]
          ).includes(e.kind),
      ),
    [data, ids, view],
  );
  const detail = data.nodes.find((n) => n.id === selected),
    relationships = data.edges.filter(
      (e) => e.from === selected || e.to === selected,
    );
  useEffect(() => {
    let disposed = false,
      observer: ResizeObserver | undefined;
    void import("cytoscape").then(({ default: cytoscape }) => {
      if (disposed || !container.current) return;
      const groups = [...new Set(visible.map((n) => n.sessionId))];
      const columns = container.current.clientWidth < 480 ? 1 : 2;
      const elements: ElementDefinition[] = [];
      let rowTop = 0;
      // Pack compound sessions explicitly: force layouts can put unrelated roots
      // inside a large expanded group. Relationships are conveyed by edges/filtering.
      for (let start = 0; start < groups.length; start += columns) {
        const row = groups.slice(start, start + columns).map((id) => {
          const members = visible.filter((n) => n.sessionId === id);
          const open = expanded.includes(id);
          const childColumns = Math.min(2, members.length);
          const childRows = Math.ceil(members.length / childColumns);
          return {
            id,
            members,
            open,
            childColumns,
            childRows,
            width: open ? childColumns * 170 + 50 : 200,
            height: open ? childRows * 110 + 70 : 120,
          };
        });
        const rowHeight = Math.max(...row.map((group) => group.height));
        let left = 0;
        for (const group of row) {
          const center = {
            x: left + group.width / 2,
            y: rowTop + rowHeight / 2,
          };
          elements.push({
            data: {
              id: `session:${group.id}`,
              label: `${group.members[0]?.personName}\nSession ${sessions.indexOf(group.id) + 1}`,
              kind: "session",
            },
            position: center,
          });
          if (group.open)
            for (const [index, n] of group.members.entries())
              elements.push({
                data: {
                  id: n.id,
                  parent: `session:${group.id}`,
                  label: n.title,
                  kind: n.kind,
                  source: n.provenance,
                },
                position: {
                  x:
                    center.x +
                    ((index % group.childColumns) -
                      (group.childColumns - 1) / 2) *
                      170,
                  y:
                    center.y +
                    (Math.floor(index / group.childColumns) -
                      (group.childRows - 1) / 2) *
                      110,
                },
              });
          left += group.width + 100;
        }
        rowTop += rowHeight + 110;
      }
      const drawn = new Set<string>();
      for (const e of edges) {
        const fromNode = visible.find((n) => n.id === e.from)!,
          toNode = visible.find((n) => n.id === e.to)!;
        const from = expanded.includes(fromNode.sessionId)
            ? e.from
            : `session:${fromNode.sessionId}`,
          to = expanded.includes(toNode.sessionId)
            ? e.to
            : `session:${toNode.sessionId}`;
        if (from === to) continue;
        const key = [from, to, e.kind].join(":");
        if (drawn.has(key)) continue;
        drawn.add(key);
        elements.push({
          data: { id: e.id, source: from, target: to, label: e.kind },
        });
      }
      const colors = getComputedStyle(container.current),
        text = colors.getPropertyValue("--text").trim() || "#f0e8dc",
        muted = colors.getPropertyValue("--secondary").trim() || "#aaa195",
        border = colors.getPropertyValue("--border").trim() || "#524638",
        accent = colors.getPropertyValue("--accent-text").trim() || "#ffb020";
      cy.current = cytoscape({
        container: container.current,
        elements,
        pixelRatio: Math.min(devicePixelRatio, 2),
        minZoom: 0.2,
        maxZoom: 3,
        style: [
          {
            selector: "node",
            style: {
              "background-color": accent,
              label: "data(label)",
              color: text,
              "font-size": 12,
              "text-wrap": "wrap",
              "text-max-width": "120px",
              "text-valign": "bottom",
              "text-margin-y": 8,
              width: 22,
              height: 22,
            },
          },
          {
            selector: 'node[kind="session"]',
            style: {
              "background-color": border,
              "background-opacity": 0.18,
              "border-width": 1,
              "border-color": muted,
              shape: "round-rectangle",
              width: 130,
              height: 80,
              padding: "55px",
              "text-valign": "top",
            },
          },
          { selector: 'node[source="synthetic"]', style: { shape: "diamond" } },
          {
            selector: "edge",
            style: {
              width: 1.4,
              "line-color": muted,
              opacity: 0.55,
              "curve-style": "bezier",
            },
          },
          {
            selector: "node:selected",
            style: { "border-color": text, "border-width": 3 },
          },
        ],
        layout: { name: "preset", fit: true, padding: 40 },
      });
      cy.current.on("tap", "node", (event) => {
        const node = event.target;
        if (node.data("kind") === "session") {
          const id = String(node.id()).slice(8);
          setExpanded((value) =>
            value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
          );
        } else setSelected(node.id());
      });
      observer = new ResizeObserver(() => cy.current?.resize());
      observer.observe(container.current);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      cy.current?.destroy();
      cy.current = null;
    };
  }, [visible, edges, expanded, sessions, theme]);
  const focusNode = (id: string) => {
    setSelected(id);
    const node = data.nodes.find((n) => n.id === id);
    if (node && !expanded.includes(node.sessionId))
      setExpanded([...expanded, node.sessionId]);
  };
  return (
    <main id="main" className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Private explorer</span>
            <h1>Stories find their connections.</h1>
          </div>
          <Link href="/profile">
            <ArrowLeft size={16} /> Profile
          </Link>
        </header>
        <p>
          Explore shared experiences and responses. These are tentative
          connections, not personality scores or predictions of friendship.
        </p>
        <div className={styles.toolbar}>
          <label>
            Source
            <select
              value={provenance}
              onChange={(e) => {
                setProvenance(e.target.value);
                setPerson("");
                setSession("");
                setCluster("");
                setSelected("");
                setLoading(true);
              }}
            >
              <option value="synthetic">Fictional profiles</option>
              <option value="real">Approved real summaries</option>
              <option value="all">Comparison lab · both</option>
            </select>
          </label>
          <label>
            Person
            <select
              value={person}
              onChange={(e) => {
                setPerson(e.target.value);
                setSession("");
              }}
            >
              <option value="">Everyone</option>
              {people.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Session
            <select
              value={session}
              onChange={(e) => setSession(e.target.value)}
            >
              <option value="">All sessions</option>
              {sessions.map((id, i) => (
                <option key={id} value={id}>
                  Session {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Connections
            <select
              value={view}
              onChange={(e) => {
                setView(e.target.value as typeof view);
                setCluster("");
              }}
            >
              <option value="experience">Shared experiences</option>
              <option value="response">Similar responses</option>
            </select>
          </label>
          <label>
            Exploratory group
            <select
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
            >
              <option value="">All groups</option>
              {data.clusters
                .filter((c) => c.view === view && c.nodeIds.length > 1)
                .map((c, i) => (
                  <option key={c.id} value={c.id}>
                    Group {i + 1} · {c.nodeIds.length} stories
                  </option>
                ))}
            </select>
          </label>
          <label>
            Find a story
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search descriptions"
            />
          </label>
          <button
            aria-label="Refresh graph"
            onClick={() => {
              setLoading(true);
              setRefresh((v) => v + 1);
            }}
          >
            <RefreshCw size={18} />
          </button>
        </div>
        {!!data.pendingSessions && (
          <p role="status">
            Connections are still processing for {data.pendingSessions}{" "}
            sessions.
          </p>
        )}
        {!!data.failedSessions && (
          <p role="status">
            Some connections need a retry. Reflections remain saved; retry from
            the owner’s history or the local operator command.
          </p>
        )}
        {error ? (
          <p role="alert" className={styles.notice}>
            {error} <Link href="/void">Go to The Void</Link>
          </p>
        ) : loading ? (
          <p role="status">Loading approved stories…</p>
        ) : !nodes.length ? (
          <div className={styles.empty}>
            <h2>No eligible stories yet.</h2>
            <p>
              Fictional sessions need to finish processing. Real stories appear
              only after their summaries are approved.
            </p>
          </div>
        ) : (
          <>
            <p className={styles.legend}>
              {nodes.length} story nodes · {edges.length} visible connections.
              Select a session to expand it. Diamonds identify fictional
              stories.
            </p>
            {nodes.length > 500 && (
              <p role="status">
                The map shows the first 500 matching stories. Filter by person
                or session to inspect the rest.
              </p>
            )}
            <div className={styles.workspace}>
              <div className={styles.canvas}>
                <div
                  ref={container}
                  className={styles.graph}
                  role="img"
                  aria-label="Exploratory story graph. All stories and relationships are available in the list below."
                />
                <div className={styles.tools}>
                  <button
                    aria-label="Zoom in"
                    onClick={() =>
                      cy.current?.zoom(
                        Math.min(3, (cy.current?.zoom() ?? 1) * 1.2),
                      )
                    }
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    aria-label="Zoom out"
                    onClick={() =>
                      cy.current?.zoom(
                        Math.max(0.2, (cy.current?.zoom() ?? 1) / 1.2),
                      )
                    }
                  >
                    <Minus size={16} />
                  </button>
                  <button
                    aria-label="Fit graph"
                    onClick={() => cy.current?.fit(undefined, 40)}
                  >
                    <Maximize2 size={16} />
                  </button>
                </div>
              </div>
              <aside className={styles.detail} aria-live="polite">
                {detail ? (
                  <>
                    <span className={styles.badge}>
                      {detail.provenance} · analysis {detail.analysisVersion}
                    </span>
                    <h2>{detail.title}</h2>
                    <p>{detail.summary}</p>
                    <h3>Why it connects</h3>
                    {relationships.length ? (
                      <ul>
                        {relationships.map((e) => (
                          <li key={e.id}>
                            <strong>
                              {e.kind.replaceAll("-", " ")}{" "}
                              {e.inferred ? "· inferred" : "· direct evidence"}
                            </strong>
                            <p>{e.reason}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        No supported connection yet. This story can stand on its
                        own.
                      </p>
                    )}
                    <small>
                      Only approved descriptions are shown. Raw audio and
                      private transcripts are not available here.
                    </small>
                  </>
                ) : (
                  <>
                    <h2>A story, in context.</h2>
                    <p>
                      Select a story from the map or the list to see the
                      evidence behind its connections.
                    </p>
                  </>
                )}
              </aside>
            </div>
            <h2>Stories and relationships</h2>
            <ul className={styles.list}>
              {visible.map((n) => (
                <li key={n.id}>
                  <button
                    aria-pressed={selected === n.id}
                    onClick={() => focusNode(n.id)}
                  >
                    <span>
                      {n.title}
                      <br />
                      <small>
                        {n.personName} · Session{" "}
                        {sessions.indexOf(n.sessionId) + 1}
                      </small>
                    </span>
                    <span className={styles.badge}>{n.provenance}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
