"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  /* --------------------------- LOAD USERS --------------------------- */
  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        console.error("Admin load error:", data);
        alert(data.error || "Failed loading users");
        setUsers([]);
      } else {
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error("Failed loading users", err);
      alert("Failed loading users.");
    }
    setLoading(false);
  };

  /* --------------------------- SAVE USER --------------------------- */
  const saveUser = async (user) => {
    try {
      setSavingId(user.id);

      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user.id,
          updates: {
            role: user.role,
            status: user.status,
            credits: user.credits,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Admin save error:", data);
        alert(data.error || "Failed saving user");
        return;
      }

      // Update replaced user
      setUsers((prev) =>
        prev.map((u) => (u.id === data.user.id ? data.user : u))
      );
    } finally {
      setSavingId(null);
    }
  };

  /* --------------------------- ON MOUNT --------------------------- */
  useEffect(() => {
    loadUsers();
  }, []);

  if (loading) {
    return (
      <div className="w-full flex justify-center py-10 text-white text-xl">
        Loading users…
      </div>
    );
  }

  /* --------------------------- HANDLE FIELD CHANGE --------------------------- */
  const handleFieldChange = (id, field, value) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id
          ? {
              ...u,
              [field]:
                field === "credits"
                  ? value === ""
                    ? ""
                    : Number(value)
                  : value,
            }
          : u
      )
    );
  };

  /* --------------------------- UI --------------------------- */
  return (
    <main className="max-w-4xl mx-auto px-4 py-10 text-white">
      <h1 className="text-3xl font-bold mb-6 text-[var(--thc-magenta)]">
        THC Edge Admin
      </h1>

      <p className="text-sm text-white/70 mb-6">
        Manage user roles, status and credits. Changes are saved per user with
        the <span className="font-semibold">Save</span> button.
      </p>

      <div className="space-y-6">
        {users.map((u) => (
          <div
            key={u.id}
            className="bg-black/40 border border-white/10 p-4 rounded-xl shadow-md"
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
              <div className="text-lg font-semibold">{u.username}</div>
              <div className="text-[10px] opacity-60 select-all">{u.id}</div>
            </div>

            {/* Form Grid */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {/* ROLE */}
              <div>
                <label className="block mb-1 text-xs uppercase tracking-wide opacity-70">
                  Role
                </label>
                <select
                  className="w-full bg-zinc-900 border border-white/10 rounded-md px-2 py-1"
                  value={u.role}
                  onChange={(e) =>
                    handleFieldChange(u.id, "role", e.target.value)
                  }
                >
                  <option value="admin">admin</option>
                  <option value="moderator">moderator</option>
                  <option value="member">member</option>
                </select>
              </div>

              {/* STATUS */}
              <div>
                <label className="block mb-1 text-xs uppercase tracking-wide opacity-70">
                  Status
                </label>
                <select
                  className="w-full bg-zinc-900 border border-white/10 rounded-md px-2 py-1"
                  value={u.status}
                  onChange={(e) =>
                    handleFieldChange(u.id, "status", e.target.value)
                  }
                >
                  <option value="active">active</option>
                  <option value="pending">pending</option>
                  <option value="disabled">disabled</option>
                </select>
              </div>

              {/* CREDITS */}
              <div>
                <label className="block mb-1 text-xs uppercase tracking-wide opacity-70">
                  Credits
                </label>
                <input
                  type="number"
                  min="0"
                  className="w-full bg-zinc-900 border border-white/10 rounded-md px-2 py-1"
                  value={u.credits === "" ? "" : Number(u.credits)}
                  onChange={(e) =>
                    handleFieldChange(u.id, "credits", e.target.value)
                  }
                />
              </div>

              {/* SAVE BUTTON */}
              <div className="flex items-end justify-end">
                <button
                  onClick={() => saveUser(u)}
                  disabled={savingId === u.id}
                  className="
                    thc-btn
                    px-4 py-2
                    text-sm font-semibold
                    rounded-lg
                    disabled:opacity-50
                    disabled:cursor-not-allowed
                  "
                >
                  {savingId === u.id ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Back Button */}
      <button
        onClick={() => router.push("/analyze")}
        className="thc-btn w-full mt-10"
      >
        Back to Analyze
      </button>
    </main>
  );
}
