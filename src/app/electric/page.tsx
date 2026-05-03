'use client';

import { useState, useEffect } from 'react';
import {
  useApp, fmt as fmtMoney, Appliance,
  getApplianceMinutes, currentYYYYMM,
} from '@/components/AppContext';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import { PlusIcon, TrashIcon, BoltIcon, PencilIcon, CheckIcon, XIcon, HomeIcon } from '@/components/Icons';

function uid() { return crypto.randomUUID(); }

function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1m';
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function ElectricPage() {
  const { settings, updateSettings, toggleAppliance, setAppliancePinned, electricBillEstimate } = useApp();
  const { appliances, electricityRate, currency } = settings;
  const fmt = (n: number) => fmtMoney(n, currency);

  // Live ticker — re-renders every 10 s so running appliances update their cost
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  // ── add form ──
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName]   = useState('');
  const [newWatts, setNewWatts] = useState('');

  // ── inline edit (wattage only) ──
  const [editId, setEditId]     = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editWatts, setEditWatts] = useState('');

  const addAppliance = () => {
    if (!newName.trim() || !newWatts) return;
    const month = currentYYYYMM();
    const a: Appliance = {
      id: uid(),
      name: newName.trim(),
      wattage: parseFloat(newWatts),
      enabled: false,
      startedAt: null,
      totalMinutesThisMonth: 0,
      lastResetMonth: month,
      pinnedToHome: false,
    };
    updateSettings({ appliances: [...appliances, a] });
    setNewName(''); setNewWatts('');
    setShowAdd(false);
  };

  const removeAppliance = (id: string) =>
    updateSettings({ appliances: appliances.filter(a => a.id !== id) });

  const startEdit = (a: Appliance) => {
    setEditId(a.id);
    setEditName(a.name);
    setEditWatts(String(a.wattage));
  };

  const saveEdit = () => {
    if (!editId) return;
    updateSettings({
      appliances: appliances.map(a =>
        a.id === editId
          ? { ...a, name: editName.trim() || a.name, wattage: parseFloat(editWatts) || a.wattage }
          : a
      ),
    });
    setEditId(null);
  };

  // Live cost computation (uses tick to stay fresh)
  const liveTotal = appliances.reduce((s, a) => {
    const hours = getApplianceMinutes(a) / 60;
    return s + (a.wattage * hours / 1000) * electricityRate;
  }, 0);

  const runningCount = appliances.filter(a => a.enabled).length;

  return (
    <div className="min-h-screen bg-[#0b0f1a]">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-2xl px-4 md:px-8 pb-28 md:pb-12">

          <PageHeader title="Electric Bill" />

          {/* ── Hero: accumulated cost this month ── */}
          <div className="relative overflow-hidden rounded-2xl border border-amber-800/30 bg-gradient-to-br from-[#231a08] to-[#1a1205] p-6 mb-6">
            <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-amber-500/8 blur-3xl" />
            <p className="text-xs font-medium uppercase tracking-widest text-amber-400/70 mb-1">
              This Month So Far
            </p>
            <p className="text-5xl font-bold text-white tabular-nums mb-3">
              {fmt(liveTotal)}
            </p>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              {runningCount > 0 ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-amber-400 font-medium">{runningCount} running now</span>
                </span>
              ) : (
                <span>No appliances running</span>
              )}
              <span>·</span>
              <span>{fmt(electricityRate)}/kWh</span>
            </div>
          </div>

          {/* ── Electricity Rate ── */}
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3 px-1">
              Electricity Rate
            </p>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-[#111827] border border-[#1e2d40] px-4 py-3.5">
              <div>
                <p className="text-sm font-medium text-white">Rate per kWh</p>
                <p className="text-xs text-slate-500 mt-0.5">Check your latest bill for the exact figure</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-500">{currency}</span>
                <input
                  type="number"
                  value={electricityRate || ''}
                  onChange={e => updateSettings({ electricityRate: parseFloat(e.target.value) || 0 })}
                  placeholder="11.80"
                  step="0.01"
                  className="w-24 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-1.5 text-right text-sm text-white outline-none focus:border-amber-500/50"
                />
              </div>
            </div>
          </div>

          {/* ── Appliances ── */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Appliances
              </p>
              <button
                onClick={() => setShowAdd(v => !v)}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" /> Add
              </button>
            </div>

            {/* Add form */}
            {showAdd && (
              <div className="mb-3 rounded-xl bg-[#1a2332] border border-blue-500/30 p-4 space-y-3">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Appliance name (e.g. Air Conditioner)"
                  autoFocus
                  className="w-full rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={newWatts}
                    onChange={e => setNewWatts(e.target.value)}
                    placeholder="Wattage (e.g. 1500)"
                    className="flex-1 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                  />
                  <span className="text-sm text-slate-500 shrink-0">W</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addAppliance}
                    disabled={!newName.trim() || !newWatts}
                    className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setShowAdd(false); setNewName(''); setNewWatts(''); }}
                    className="flex-1 rounded-lg bg-white/5 py-2.5 text-sm text-slate-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {appliances.length === 0 && !showAdd && (
              <div className="rounded-xl border border-dashed border-[#1e2d40] px-4 py-10 text-center">
                <BoltIcon className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-sm font-medium text-white mb-1">No appliances yet</p>
                <p className="text-xs text-slate-500 mb-4 max-w-xs mx-auto">
                  Add each device, then toggle it on when you switch it on and off when you switch it off. Cost accumulates in real time.
                </p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white"
                >
                  <PlusIcon className="w-4 h-4" /> Add first appliance
                </button>
              </div>
            )}

            {/* Appliance rows */}
            {appliances.length > 0 && (
              <div className="space-y-2">
                {appliances.map(a => {
                  const minutes = getApplianceMinutes(a);
                  const cost = (a.wattage * (minutes / 60) / 1000) * electricityRate;
                  const isEditing = editId === a.id;

                  return (
                    <div
                      key={a.id}
                      className={`rounded-xl border transition-colors ${
                        a.enabled
                          ? 'bg-[#1e1a0e] border-amber-700/30'
                          : 'bg-[#111827] border-[#1e2d40]'
                      }`}
                    >
                      {isEditing ? (
                        <div className="px-4 py-3 space-y-2.5">
                          <input
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            autoFocus
                            className="w-full rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                          />
                          <div className="flex gap-2 items-center">
                            <input
                              type="number"
                              value={editWatts}
                              onChange={e => setEditWatts(e.target.value)}
                              className="flex-1 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                            />
                            <span className="text-sm text-slate-500 shrink-0">W</span>
                            <button onClick={saveEdit}
                              className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 shrink-0">
                              <CheckIcon className="w-4 h-4 text-white" />
                            </button>
                            <button onClick={() => setEditId(null)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 shrink-0">
                              <XIcon className="w-4 h-4 text-slate-400" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          {/* Toggle */}
                          <button
                            onClick={() => toggleAppliance(a.id)}
                            className={`relative h-8 w-14 rounded-full shrink-0 transition-colors duration-200 ${
                              a.enabled ? 'bg-amber-500' : 'bg-white/10'
                            }`}
                          >
                            <div className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-all duration-200 ${
                              a.enabled ? 'left-[30px]' : 'left-1'
                            }`} />
                          </button>

                          {/* Name + wattage */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{a.name}</p>
                            <p className="text-xs text-slate-500">{a.wattage}W</p>
                          </div>

                          {/* Cost + duration */}
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-semibold ${cost > 0 ? 'text-white' : 'text-slate-600'}`}>
                              {fmt(cost)}
                            </p>
                            <p className={`text-xs ${a.enabled ? 'text-amber-400' : 'text-slate-600'}`}>
                              {a.enabled
                                ? `on · ${formatDuration(minutes)}`
                                : minutes > 0
                                  ? formatDuration(minutes) + ' this mo'
                                  : 'off'}
                            </p>
                          </div>

                          {/* Pin / edit / delete */}
                          <div className="flex gap-0.5 shrink-0">
                            <button
                              onClick={() => setAppliancePinned(a.id, !a.pinnedToHome)}
                              title={a.pinnedToHome ? 'Remove from dashboard' : 'Add to dashboard'}
                              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                                a.pinnedToHome
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'hover:bg-white/10 text-slate-600 hover:text-slate-400'
                              }`}
                            >
                              <HomeIcon className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => startEdit(a)}
                              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 transition-colors">
                              <PencilIcon className="w-3.5 h-3.5 text-slate-500" />
                            </button>
                            <button onClick={() => removeAppliance(a.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 transition-colors">
                              <TrashIcon className="w-3.5 h-3.5 text-red-400/50 hover:text-red-400" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
