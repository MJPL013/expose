"use client";
import { useEffect } from "react";
import type { AccountView } from "@expose/shared/account";
import { AccountPreferencesSchema } from "@expose/shared/account";
import { useServices } from "../session/provider";
import { accountApi } from "./client";
/** Only account preferences sync automatically. Browser cards require explicit import. */
export function AccountSync() {
  const { preferences } = useServices();
  useEffect(() => {
    let disposed = false,
      unsubscribe: (() => void) | undefined,
      timer: ReturnType<typeof setTimeout> | undefined;
    let accountId = "",
      last = "",
      generation = 0;
    const refresh = async () => {
      const request = ++generation;
      try {
        const me = await accountApi<AccountView>("/me");
        if (disposed || request !== generation) return;
        if (me.account?.id === accountId) return;
        unsubscribe?.();
        clearTimeout(timer);
        accountId = me.account?.id ?? "";
        if (!accountId) return;
        preferences.load();
        if (me.preferences) preferences.applyAccount(me.preferences);
        last = JSON.stringify(
          AccountPreferencesSchema.parse(preferences.getSnapshot()),
        );
        if (!me.preferences)
          await accountApi("/preferences", "PUT", {
            accountId,
            preferences: JSON.parse(last),
          });
        if (disposed || request !== generation) return;
        unsubscribe = preferences.subscribe(() => {
          const expectedAccount = accountId;
          const payload = AccountPreferencesSchema.parse(
              preferences.getSnapshot(),
            ),
            serialized = JSON.stringify(payload);
          if (serialized === last) return;
          clearTimeout(timer);
          timer = setTimeout(() => {
            void accountApi("/preferences", "PUT", {
              accountId: expectedAccount,
              preferences: payload,
            })
              .then(() => {
                last = serialized;
                window.dispatchEvent(
                  new CustomEvent("expose-account-sync", {
                    detail: "Saved to your account",
                  }),
                );
              })
              .catch(() =>
                window.dispatchEvent(
                  new CustomEvent("expose-account-sync", {
                    detail: "Saved on this device. Account sync needs a retry.",
                  }),
                ),
              );
          }, 500);
        });
      } catch {
        /* Guest play remains available while the account service is offline. */
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("expose-auth-change", refresh);
    return () => {
      disposed = true;
      generation++;
      unsubscribe?.();
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("expose-auth-change", refresh);
    };
  }, [preferences]);
  return null;
}
