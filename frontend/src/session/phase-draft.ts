import { useEffect, useState } from "react";
/** Tab-private drafts expire after two hours and are never included in host context. */
export function usePhaseDraft<T>(
  scope: string,
  initial: T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const key = `expose.draft.v2:${scope}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (saved?.expires > Date.now()) return saved.value as T;
    } catch {
      /* Optional storage. */
    }
    return initial;
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({ value, expires: Date.now() + 7200000 }),
      );
      for (const name of Object.keys(sessionStorage))
        if (name.startsWith("expose.draft.v2:")) {
          try {
            if (
              JSON.parse(sessionStorage.getItem(name) ?? "null")?.expires <
              Date.now()
            )
              sessionStorage.removeItem(name);
          } catch {
            sessionStorage.removeItem(name);
          }
        }
    } catch {
      /* Continue in memory. */
    }
  }, [key, value]);
  return [value, setValue];
}
