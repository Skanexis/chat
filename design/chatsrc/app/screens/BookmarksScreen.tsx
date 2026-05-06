import React, { useState } from "react";
import { Bookmark, Clock, CheckCircle2, Sparkles, Filter, Bell, AlertTriangle } from "lucide-react";
import { FilterBar, Button, Card } from "../components/ui";
import { DraftPanel, ScheduledQueue, UnreadSummaryCard, KeywordAlertManager } from "../components/kits/ProductivityKit";

export function BookmarksScreen() {
  const [tab, setTab] = useState<"summary" | "drafts" | "scheduled" | "alerts">("summary");

  const [keywords, setKeywords] = useState([
    { id: "1", word: "bug", active: true, hits: 14 },
    { id: "2", word: "deployment", active: true, hits: 2 },
    { id: "3", word: "urgent", active: false, hits: 0 },
  ]);

  const [alerts, setAlerts] = useState([
    { id: "a1", keyword: "bug", content: "Hey, I found a bug in the new release. The buttons are not responding on mobile.", author: "Alex D.", time: "10m ago", read: false },
    { id: "a2", keyword: "deployment", content: "The v2.4 deployment is scheduled for 5 PM UTC today.", author: "DevOps Bot", time: "1h ago", read: true },
    { id: "a3", keyword: "bug", content: "Can someone check this bug report? It seems critical.", author: "Sarah M.", time: "2h ago", read: true },
  ]);

  const handleToggleKeyword = (id: string) => {
    setKeywords(prev => prev.map(k => k.id === id ? { ...k, active: !k.active } : k));
  };

  const handleRemoveKeyword = (id: string) => {
    setKeywords(prev => prev.filter(k => k.id !== id));
  };

  const handleAddKeyword = (word: string) => {
    setKeywords(prev => [...prev, { id: Math.random().toString(), word, active: true, hits: 0 }]);
  };

  const markAlertAsRead = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-y-auto font-sans">
      <header className="bg-zinc-950/80 backdrop-blur-xl px-5 py-6 flex flex-col gap-4 border-b border-zinc-800 sticky top-0 z-40">
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
          <Sparkles className="text-blue-500" size={28} />
          Workspace
        </h1>
        <FilterBar className="bg-transparent border-0 p-0 shadow-none">
          <Button variant={tab === "summary" ? "primary" : "secondary"} size="sm" onClick={() => setTab("summary")} className="rounded-full">Catch Up</Button>
          <Button variant={tab === "drafts" ? "primary" : "secondary"} size="sm" onClick={() => setTab("drafts")} className="rounded-full">Drafts</Button>
          <Button variant={tab === "scheduled" ? "primary" : "secondary"} size="sm" onClick={() => setTab("scheduled")} className="rounded-full">Scheduled</Button>
          <Button variant={tab === "alerts" ? "primary" : "secondary"} size="sm" onClick={() => setTab("alerts")} className="rounded-full">
            Alerts {alerts.filter(a => !a.read).length > 0 && <span className="ml-1 bg-amber-500 text-black px-1.5 rounded-full text-[10px] font-bold">{alerts.filter(a => !a.read).length}</span>}
          </Button>
        </FilterBar>
      </header>

      <div className="flex-1 p-4 flex flex-col gap-6 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed bg-opacity-5 pb-24">
        {tab === "summary" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <UnreadSummaryCard 
              count={42} 
              summary="While you were away, the team discussed the new release schedule. Alex created a poll for the launch date, and 12 bugs were closed in the #dev channel. You were mentioned 2 times in #general regarding the design system update."
            />
          </div>
        )}

        {tab === "drafts" && (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <DraftPanel 
              drafts={[
                { id: "1", content: "Hey team, just wanted to share the latest updates on the...", timeAgo: "10m ago" },
                { id: "2", content: "I think we should reconsider the color palette for the...", timeAgo: "2h ago" },
              ]}
              onResume={console.log}
              onDelete={console.log}
            />
          </div>
        )}

        {tab === "scheduled" && (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <ScheduledQueue 
              items={[
                { id: "1", content: "Reminder: Weekly sync in 10 minutes! Join the call here...", time: "Today, 14:50" },
                { id: "2", content: "Happy Monday! Let's hit our targets this week 🚀", time: "Mon, 09:00" },
              ]}
              onCancel={console.log}
            />
          </div>
        )}

        {tab === "alerts" && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div>
              <h2 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-4">Tracked Keywords</h2>
              <KeywordAlertManager 
                keywords={keywords}
                onToggle={handleToggleKeyword}
                onRemove={handleRemoveKeyword}
                onAdd={handleAddKeyword}
              />
            </div>
            
            <div>
              <h2 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Bell size={14} /> Recent Alerts
              </h2>
              <div className="flex flex-col gap-3">
                {alerts.length === 0 ? (
                  <div className="text-sm text-zinc-500 italic py-4 text-center">No alerts to show.</div>
                ) : (
                  alerts.map(alert => (
                    <Card key={alert.id} className={`p-4 border-l-4 transition-colors cursor-pointer group ${alert.read ? 'bg-zinc-900/50 border-zinc-800' : 'bg-amber-950/20 border-amber-500 hover:bg-amber-950/40'}`} onClick={() => markAlertAsRead(alert.id)}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={14} className={alert.read ? "text-zinc-500" : "text-amber-500"} />
                          <span className="text-xs font-bold text-zinc-400">{alert.author}</span>
                          <span className="text-xs text-zinc-600">• {alert.time}</span>
                        </div>
                        <span className="text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                          {alert.keyword}
                        </span>
                      </div>
                      <p className={`text-sm ${alert.read ? 'text-zinc-400' : 'text-zinc-200'} leading-relaxed`}>{alert.content}</p>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
