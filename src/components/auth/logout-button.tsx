"use client";

import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import { getFirebaseAuth } from "@/lib/firebase/auth";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await api("/api/auth/session", { method: "DELETE" });
    await signOut(getFirebaseAuth()).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={logout} loading={pending} className={className}>
      Log out
    </Button>
  );
}
