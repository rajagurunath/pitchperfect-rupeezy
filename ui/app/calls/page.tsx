"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Call } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, ScoreBadge, StatusPill, Button } from "@/components/ui";
import { formatDuration, formatTime } from "@/lib/utils";

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(10); // Default page size

  async function refresh() {
    setCalls(await api.calls(filter ? { score: filter } : undefined));
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Calculate paginated calls
  const paginatedCalls = calls.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const totalPages = Math.max(1, Math.ceil(calls.length / pageSize));

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calls</h1>
          <p className="text-sm text-ink-mute mt-1">All outbound calls and their disposition.</p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-ink-line bg-ink-card px-3 py-1.5 text-sm"
        >
          <option value="">All scores</option>
          <option value="HOT">Hot only</option>
          <option value="WARM">Warm only</option>
          <option value="COLD">Cold only</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-ink-mute text-xs border-b border-ink-line">
              <tr>
                <th className="px-4 py-2 font-medium">Lead</th>
                <th className="px-4 px-2 font-medium">Phone</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Score</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {calls.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-sm text-ink-mute">No calls match this filter.</td>
                </tr>
              ) : (
                paginatedCalls.map((c) => (
                  <tr key={c.id} className="border-b border-ink-line hover:bg-ink-line/40">
                    <td className="px-4 py-2.5">{c.lead_name ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{c.lead_phone ?? "—"}</td>
                    <td className="px-4 py-2.5"><StatusPill status={c.status} /></td>
                    <td className="px-4 py-2.5"><ScoreBadge score={c.score} /></td>
                    <td className="px-4 py-2.5 text-ink-mute">{formatDuration(c.duration_seconds)}</td>
                    <td className="px-4 py-2.5 text-ink-mute">{formatTime(c.started_at ?? c.created_at)}</td>
                    <td className="px-4 py-2.5"><Link href={`/calls/${c.id}`} className="text-accent text-xs hover:underline">Open</Link></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      {calls.length > pageSize && (
        <div className="flex justify-center items-center space-x-3 mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 0))}
            disabled={currentPage === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-ink-text">
            Page {currentPage + 1} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages - 1))}
            disabled={currentPage >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
