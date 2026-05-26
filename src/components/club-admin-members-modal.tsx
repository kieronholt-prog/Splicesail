"use client";

import { useEffect, useId, useRef, useState } from "react";
import { addGroupMemberByUserIdAction, removeGroupMemberAction } from "@/app/actions/group-members";

export type ClubAdminMemberRowVm = {
  userId: string;
  displayName: string | null;
  role: string;
};

export type ClubAdminGuestBoatVm = {
  id: string;
  label: string;
  className: string | null;
  defaultSailNumber: string | null;
  ryaClassKey: string | null;
  linkedBoatId: string | null;
};

export type ClubAdminGuestSailorVm = {
  id: string;
  firstName: string;
  lastName: string;
  linkedUserId: string | null;
  boats: ClubAdminGuestBoatVm[];
};

function roleLabel(role: string): string {
  if (role === "club_admin") return "Club admin";
  if (role === "race_officer") return "Race officer";
  if (role === "guest_sailor") return "Guest sailor";
  if (role === "sailor") return "Sailor";
  return role.replace(/_/g, " ");
}

export function ClubAdminMembersModal(props: {
  groupId: string;
  currentUserId: string;
  members: ClubAdminMemberRowVm[];
  /** After a server action redirect, reopen the dialog so admins can continue. */
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(props.autoOpen ?? false);
  const titleId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (open && e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open]);

  const adminCount = props.members.filter((m) => m.role === "club_admin").length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 justify-center rounded-lg border border-splice-water bg-white px-4 py-2 text-sm font-medium text-splice-navy transition hover:bg-splice-foam dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-surface dark:hover:bg-splice-navy"
      >
        Members
      </button>
      {open ? (
        <div
          ref={backdropRef}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="presentation"
          onClick={(e) => {
            if (e.target === backdropRef.current) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[min(85vh,calc(100vh-4rem))] w-full max-w-xl overflow-y-auto rounded-xl border border-splice-sky bg-white p-5 shadow-lg outline-none dark:border-splice-ocean dark:bg-splice-navy"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-splice-sky pb-4 dark:border-splice-ocean">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
                Members
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-lg border border-splice-water px-3 py-1.5 text-sm font-medium text-splice-navy-light dark:border-splice-ocean dark:text-splice-sky"
              >
                Close
              </button>
            </div>
            <div className="space-y-6 pt-4">
              <section className="rounded-lg border border-dashed border-splice-sky bg-splice-surface px-3 py-3 dark:border-splice-ocean dark:bg-splice-navy/40">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
                  Race-day boats (no series signup)
                </h3>
                <p className="mt-2 text-[11px] text-splice-ocean dark:text-splice-water">
                  Race officers add <strong className="text-splice-navy-light dark:text-splice-sky">ad-hoc</strong> boats (sail number
                  + class) on the <strong className="text-splice-navy-light dark:text-splice-sky">Start line</strong> or{" "}
                  <strong className="text-splice-navy-light dark:text-splice-sky">Finishes</strong> screen. When a sailor joins the
                  series, staff <strong className="text-splice-navy-light dark:text-splice-sky">link</strong> that scratch row to their
                  official race entry so results copy across and series scoring stays correct.
                </p>
              </section>
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
                  Link existing account (member)
                </h3>
                <form action={addGroupMemberByUserIdAction} className="mt-2 space-y-3">
                  <input type="hidden" name="group_id" value={props.groupId} />
                  <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
                    Sign-in user ID (UUID)
                    <input
                      name="member_user_id"
                      type="text"
                      required
                      autoComplete="off"
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="rounded-lg border border-splice-water bg-white px-2 py-2 font-mono text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
                    Role
                    <select
                      name="role"
                      className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                      defaultValue="sailor"
                    >
                      <option value="sailor">Sailor</option>
                      <option value="race_officer">Race officer</option>
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg border border-splice-water bg-white px-4 py-2 text-sm font-medium text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-surface"
                  >
                    Link member
                  </button>
                </form>
                <p className="mt-2 text-[11px] text-splice-blue dark:text-splice-water">
                  Use when the person already has a Splice login. Club admin promotion is done from the members list
                  below.
                </p>
              </section>
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">Members</h3>
                <p className="mt-1 text-[11px] text-splice-blue dark:text-splice-water">
                  Signed-in accounts with access to this club.
                </p>
                <div className="mt-2 overflow-x-auto rounded-lg border border-splice-sky dark:border-splice-ocean">
                  <table className="w-full min-w-[320px] text-left text-sm">
                    <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
                      <tr>
                        <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Name</th>
                        <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Role</th>
                        <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-splice-sky dark:divide-splice-navy-light">
                      {props.members.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-6 text-center text-xs text-splice-blue">
                            No members yet.
                          </td>
                        </tr>
                      ) : (
                        props.members.map((m) => {
                          const cannotRemove = m.role === "club_admin" && adminCount <= 1;
                          return (
                            <tr key={m.userId}>
                              <td className="px-3 py-2 text-splice-navy dark:text-splice-foam">
                                {m.displayName ?? "—"}
                                {m.userId === props.currentUserId ? (
                                  <span className="ml-2 text-xs text-splice-blue">(you)</span>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 text-splice-ocean dark:text-splice-water">{roleLabel(m.role)}</td>
                              <td className="px-3 py-2">
                                {cannotRemove ? (
                                  <span className="text-[11px] text-splice-water">—</span>
                                ) : (
                                  <form action={removeGroupMemberAction} className="inline">
                                    <input type="hidden" name="group_id" value={props.groupId} />
                                    <input type="hidden" name="member_user_id" value={m.userId} />
                                    <button
                                      type="submit"
                                      className="text-xs font-medium text-red-700 underline-offset-4 hover:underline dark:text-red-400"
                                    >
                                      Remove
                                    </button>
                                  </form>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
