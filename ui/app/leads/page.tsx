"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, Lead, Voice, VoiceCatalog } from "@/lib/api";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, StatusPill, Textarea } from "@/components/ui";
import { formatTime } from "@/lib/utils";

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [voiceCatalog, setVoiceCatalog] = useState<VoiceCatalog | null>(null);
  const [voiceId, setVoiceId] = useState<string>("");

  async function refresh() {
    try { setLeads(await api.leads()); } catch (e: any) { setErr(e.message); }
  }

  useEffect(() => {
    refresh();
    api.voices().then((vc) => {
      setVoiceCatalog(vc);
      setVoiceId(vc.default_voice_id);
    }).catch(() => { /* not fatal */ });
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const formEl = e.currentTarget;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const body = {
        name: String(form.get("name") || "").trim(),
        phone: String(form.get("phone") || "").trim(),
        language_pref: String(form.get("language_pref") || "").trim() || undefined,
        voice_id: voiceId || undefined,
        agent_name: String(form.get("agent_name") || "").trim() || undefined,
        notes: String(form.get("notes") || "").trim() || undefined,
      };
      if (!body.name || !body.phone) {
        throw new Error("Name and phone are required.");
      }
      if (!body.phone.startsWith("+")) {
        throw new Error("Phone must be E.164 (start with +).");
      }
      const created = await api.createLead(body);
      setMsg(`Added ${created.name}`);
      formEl.reset();
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(file: File) {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.uploadCsv(file);
      setMsg(`Inserted ${r.inserted}${r.skipped.length ? ` (skipped ${r.skipped.length})` : ""}`);
      await refresh();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function callLead(id: string) {
    try {
      await api.callLead(id);
      setMsg("Call placed.");
      await refresh();
    } catch (e: any) { setErr(e.message); }
  }

  async function callBatch() {
    try {
      const r = await api.callBatch(10);
      setMsg(`Batch dialing ${r.placed.length} leads.`);
      await refresh();
    } catch (e: any) { setErr(e.message); }
  }

  async function deleteLead(id: string) {
    if (!confirm("Delete this lead?")) return;
    try { await api.deleteLead(id); await refresh(); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-ink-mute mt-1">Add leads one by one or upload a CSV. Trigger calls when ready.</p>
        </div>
        <Button onClick={callBatch} disabled={busy}>Call next 10 queued</Button>
      </div>

      {err && <div className="text-hot text-sm">{err}</div>}
      {msg && <div className="text-accent text-sm">{msg}</div>}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Add a lead</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required placeholder="Ravi Kumar" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">Phone (E.164)</Label>
                <Input id="phone" name="phone" required placeholder="+919444531354" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="language_pref">Language preference (optional)</Label>
                <Input id="language_pref" name="language_pref" placeholder="hi-IN, en-IN, ta-IN" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="agent_name">Agent name (optional)</Label>
                  <Input
                    id="agent_name"
                    name="agent_name"
                    placeholder="Priya, Anjali, Rohan…"
                  />
                  <p className="text-[11px] text-ink-mute">
                    How the agent introduces itself on the call.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="voice_id">Voice (ElevenLabs)</Label>
                  <select
                    id="voice_id"
                    name="voice_id"
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    className="w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-sm text-ink-text outline-none focus:border-accent"
                  >
                    {(voiceCatalog?.voices ?? []).map((v: Voice) => (
                      <option key={v.voice_id} value={v.voice_id}>
                        {v.name} — {v.description}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes">Notes for the agent (optional)</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  placeholder="e.g. Existing MFD with 50 clients, prefers daily payouts. Mention RISE Portal demo."
                />
                <p className="text-[11px] text-ink-mute">
                  These notes go into the agent's system prompt so it can adapt the pitch.
                  Don't write the script — write what *you know* about the lead.
                </p>
              </div>
              <Button disabled={busy} type="submit">Add lead</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Bulk upload</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-ink-mute">
              CSV with columns: <span className="font-mono">name, phone</span>
              <span className="text-ink-mute"> (and optional <span className="font-mono">language_pref</span>, <span className="font-mono">notes</span>)</span>.
              Phone must be E.164.
            </p>
            <FileDrop disabled={busy} onPick={onUpload} />
            <details className="text-xs text-ink-mute">
              <summary className="cursor-pointer hover:text-ink-text">Sample CSV</summary>
              <pre className="mt-2 p-3 rounded-md bg-ink border border-ink-line font-mono text-[11px] whitespace-pre-wrap">{`name,phone,language_pref,notes
Ravi Kumar,+919444531354,hi-IN,Existing MFD with 50 clients
Asha Iyer,+919876543210,ta-IN,
Vikram Shah,+919812345678,,Inbound from Instagram ad`}</pre>
            </details>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>All leads ({leads.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {leads.length === 0 ? (
            <div className="p-6 text-sm text-ink-mute">No leads yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-ink-mute text-xs border-b border-ink-line">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Phone</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Lang</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b border-ink-line hover:bg-ink-line/40">
                    <td className="px-4 py-2.5">{l.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{l.phone}</td>
                    <td className="px-4 py-2.5"><StatusPill status={l.status} /></td>
                    <td className="px-4 py-2.5 text-ink-mute">{l.language_pref ?? "auto"}</td>
                    <td className="px-4 py-2.5 text-ink-mute">{formatTime(l.created_at)}</td>
                    <td className="px-4 py-2.5 flex gap-2 justify-end">
                      <Button variant="primary" onClick={() => callLead(l.id)} disabled={l.status === "calling"}>
                        Call
                      </Button>
                      <Button variant="ghost" onClick={() => deleteLead(l.id)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FileDrop({ onPick, disabled }: { onPick: (f: File) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      onClick={() => ref.current?.click()}
      className="rounded-lg border border-dashed border-ink-line p-6 text-center cursor-pointer hover:border-accent text-sm text-ink-mute"
    >
      Drop or click to upload .csv
      <input
        ref={ref}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
