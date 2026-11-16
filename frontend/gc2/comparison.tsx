"use client";
import { useEffect, useState } from "react";
import type { ComparisonSummary } from "@expose/shared/gc2-graph";
import { api } from "./client";
import styles from "./explorer.module.css";
export function ComparisonApproval({ sessionId }: { sessionId: string }) {
  const [summary, setSummary] = useState<ComparisonSummary | null>(null),
    [items, setItems] = useState<ComparisonSummary["items"]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void api<{ summaries: ComparisonSummary[] }>("/comparisons")
      .then((r) => {
        if (!active) return;
        const found =
          r.summaries.find((s) => s.sessionId === sessionId) ?? null;
        setSummary(found);
        setItems(found?.items ?? []);
      })
      .catch(() => {
        if (active) setNotice("Comparison settings could not load.");
      });
    return () => {
      active = false;
    };
  }, [sessionId]);
  const save = async (approved: boolean) => {
    if (!summary) return;
    setBusy(true);
    setNotice("");
    try {
      await api(`/comparisons/${summary.id}`, "PUT", {
        revision: summary.revision,
        approved,
        items,
      });
      setSummary({
        ...summary,
        items,
        approved,
        revision: summary.revision + 1,
      });
      setNotice(
        approved
          ? "This summary is approved for private comparison. Your recordings and transcript stay private."
          : "This summary is private and excluded from comparisons.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  if (!summary?.items.length)
    return notice ? <p role="status">{notice}</p> : null;
  return (
    <section
      className={styles.approval}
      aria-label="Story comparison permission"
    >
      <span className={styles.eyebrow}>Your choice</span>
      <h2>
        {summary.approved
          ? "A little common ground"
          : "Keep it private, or find common ground"}
      </h2>
      <p>
        Your conversation stays private. You can approve these edited
        descriptions for the private research explorer. There are no public
        introductions yet.
      </p>
      <details>
        <summary>Review {items.length} story descriptions</summary>
        {items.map((item, index) => (
          <fieldset key={item.key}>
            <legend>{item.title}</legend>
            <label>
              Experience
              <textarea
                maxLength={350}
                value={item.experience}
                onChange={(e) =>
                  setItems(
                    items.map((v, i) =>
                      i === index ? { ...v, experience: e.target.value } : v,
                    ),
                  )
                }
              />
            </label>
            <label>
              Your response
              <textarea
                maxLength={350}
                value={item.response}
                onChange={(e) =>
                  setItems(
                    items.map((v, i) =>
                      i === index ? { ...v, response: e.target.value } : v,
                    ),
                  )
                }
              />
            </label>
            {item.metadata && (
              <details>
                <summary>Review supporting story details and tags</summary>
                {Object.entries(item.metadata).map(([key, value]) => (
                  <div key={key}>
                    <strong>{key}</strong>
                    {(Array.isArray(value) ? value : value ? [value] : []).map(
                      (field, fieldIndex) => (
                        <label key={fieldIndex}>
                          {field.source}
                          <textarea
                            maxLength={280}
                            value={field.text}
                            onChange={(e) =>
                              setItems(
                                items.map((v, i) => {
                                  if (i !== index || !v.metadata) return v;
                                  const metadata = { ...v.metadata };
                                  if (key === "tags")
                                    metadata.tags = metadata.tags.map((t, j) =>
                                      j === fieldIndex
                                        ? { ...t, text: e.target.value }
                                        : t,
                                    );
                                  else {
                                    const name = key as Exclude<
                                      keyof typeof metadata,
                                      "tags"
                                    >;
                                    const entry = metadata[name];
                                    if (entry)
                                      metadata[name] = {
                                        ...entry,
                                        text: e.target.value,
                                      };
                                  }
                                  return { ...v, metadata };
                                }),
                              )
                            }
                          />
                        </label>
                      ),
                    )}
                  </div>
                ))}
                <button
                  onClick={() =>
                    setItems(
                      items.map((v, i) =>
                        i === index ? { ...v, metadata: null } : v,
                      ),
                    )
                  }
                >
                  Exclude these details
                </button>
              </details>
            )}
            <button
              onClick={() => setItems(items.filter((_, i) => i !== index))}
            >
              Exclude this story
            </button>
          </fieldset>
        ))}
      </details>
      <div className={styles.actions}>
        <button
          disabled={busy || !items.length}
          onClick={() => void save(true)}
        >
          {summary.approved ? "Approve this version" : "Approve summary"}
        </button>
        <button disabled={busy} onClick={() => void save(false)}>
          {summary.approved ? "Withdraw approval" : "Save privately"}
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
