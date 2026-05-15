"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Pencil, Check, X, Megaphone } from "lucide-react";
import { Button, Input, Textarea, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { type Campaign, loadCampaigns, saveCampaigns } from "@/lib/campaigns";

const EMPTY: Omit<Campaign, "id" | "createdAt"> = {
  title: "",
  description: "",
  details: "",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => { setCampaigns(loadCampaigns()); }, []);

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setShowForm(true);
  }

  function openEdit(c: Campaign) {
    setEditing(c);
    setForm({ title: c.title, description: c.description, details: c.details });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY);
  }

  function saveForm() {
    if (!form.title.trim()) return;
    let updated: Campaign[];
    if (editing) {
      updated = campaigns.map((c) =>
        c.id === editing.id ? { ...c, ...form } : c
      );
    } else {
      const next: Campaign = {
        id: crypto.randomUUID(),
        ...form,
        createdAt: new Date().toISOString(),
      };
      updated = [next, ...campaigns];
    }
    saveCampaigns(updated);
    setCampaigns(updated);
    cancelForm();
  }

  function remove(id: string) {
    const updated = campaigns.filter((c) => c.id !== id);
    saveCampaigns(updated);
    setCampaigns(updated);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-ink-mute mt-1">
            Define campaign context — title, pitch, and details — then select
            one in Studio to seed the agent simulation.
          </p>
        </div>
        <Button onClick={openNew} className="shrink-0">
          <Plus size={14} className="mr-1.5" />
          New campaign
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editing ? "Edit campaign" : "New campaign"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-text">Campaign title</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Diwali AP Drive — Hindi"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-text">Description</label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short one-liner shown in Studio dropdown"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-text">Details / context</label>
              <Textarea
                rows={5}
                value={form.details}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                placeholder={`Target audience, key objections to handle, talking points, promotions…\n\nThis text flows directly into the agent's context during simulation.`}
              />
              <p className="text-[11px] text-ink-mute">
                Injected as lead notes into the agent prompt when selected in Studio.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button onClick={saveForm} disabled={!form.title.trim()}>
                <Check size={14} className="mr-1.5" />
                {editing ? "Save changes" : "Create campaign"}
              </Button>
              <Button variant="secondary" onClick={cancelForm}>
                <X size={14} className="mr-1.5" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {campaigns.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4 rounded-2xl border border-dashed border-ink-line">
          <div className="h-12 w-12 rounded-full bg-accent/10 ring-1 ring-accent/30 flex items-center justify-center">
            <Megaphone size={20} className="text-accent" />
          </div>
          <div>
            <div className="text-sm font-medium text-ink-text">No campaigns yet</div>
            <p className="text-xs text-ink-mute mt-1 max-w-xs">
              Create a campaign to capture its context and use it in Studio simulations.
            </p>
          </div>
          <Button onClick={openNew}>
            <Plus size={14} className="mr-1.5" />
            New campaign
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {campaigns.map((c) => (
          <Card key={c.id} className="group">
            <CardContent className="py-4 flex gap-4 items-start">
              <div className="h-9 w-9 shrink-0 rounded-lg bg-accent/10 ring-1 ring-accent/25 flex items-center justify-center">
                <Megaphone size={16} className="text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-ink-text">{c.title}</span>
                  <span className="text-[10px] text-ink-mute font-mono">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {c.description && (
                  <p className="text-xs text-ink-mute mt-0.5">{c.description}</p>
                )}
                {c.details && (
                  <p className="text-xs text-ink-mute mt-2 leading-relaxed line-clamp-2 whitespace-pre-line">
                    {c.details}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => openEdit(c)}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-ink-mute hover:bg-ink-line hover:text-ink-text transition-colors"
                  aria-label="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => remove(c.id)}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-ink-mute hover:bg-ink-line hover:text-hot transition-colors"
                  aria-label="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
