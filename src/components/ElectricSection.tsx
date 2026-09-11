'use client';

import { useState, useEffect } from 'react';
import {
  useApp, fmt as fmtMoney, Appliance,
  getApplianceMinutes, calcElectric,
} from './AppContext';
import { currentCycleKey } from '@/lib/cycle';
import { PlusIcon, TrashIcon, BoltIcon, PencilIcon, CheckIcon, XIcon, HomeIcon } from './Icons';

function uid() { return crypto.randomUUID(); }

function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1m';
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Appliance tracking, lifted out of the old /electric page so it can live on the
// Budget page. Self-contained: it runs its own ticker so running appliances keep
// accruing cost regardless of what re-renders around it.
export default function ElectricSection() {
  const { settings, updateSettings, toggleAppliance, setAppliancePinned } = useApp();
  const { appliances, electricityRate, currency } = settings;
  // Bound to the user's currency once, so every fmt() below is already in it.
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

  // ── inline edit (name + wattage) ──
  const [editId, setEditId]     = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editWatts, setEditWatts] = useState('');

  const addAppliance = () => {
    if (!newName.trim() || !newWatts) return;
    const month = currentCycleKey(settings.cycleStartDay);
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

  const liveTotal = calcElectric(settings);
  const runningCount = appliances.filter(a => a.enabled).length;

  return (
    <div id="electric" className="scroll-mt-6">
      {/* ── Hero: the running estimate for this cycle ── */}
      <div className="rounded-2xl border border-line bg-surface p-5 mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-3 mb-2">
          Electric · Est. This Cycle
        </p>
        <p className="text-4xl font-bold text-ink tabular-nums mb-3">
          {fmt(liveTotal)}
        </p>
        <div className="flex items-center gap-3 text-xs text-ink-3">
          {runningCount > 0 ? (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-primary-text font-medium">{runningCount} running now</span>
            </span>
          ) : (
            <span>No appliances running</span>
          )}
          <span>·</span>
          <span>{fmt(electricityRate)}/kWh</span>
        </div>
      </div>

      {/* ── Electricity Rate ── */}
      <div className="flex items-center justify-between gap-4 rounded-xl bg-surface border border-line px-4 py-3.5 mb-4">
        <div>
          <p className="text-sm font-medium text-ink">Rate per kWh</p>
          <p className="text-xs text-ink-3 mt-0.5">Check your latest bill for the exact figure</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-ink-3">{currency}</span>
          <input
            type="number"
            inputMode="decimal"
            value={electricityRate || ''}
            onChange={e => updateSettings({ electricityRate: parseFloat(e.target.value) || 0 })}
            placeholder="11.80"
            step="0.01"
            className="w-24 rounded-lg bg-canvas border border-line px-3 py-1.5 text-right text-sm text-ink outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* ── Appliances ── */}
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-3">
          Appliances
        </p>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1 text-xs text-primary-text hover:text-primary-hover transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mb-3 rounded-xl bg-raised border border-primary-edge p-4 space-y-3">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Appliance name (e.g. Air Conditioner)"
            autoFocus
            className="w-full rounded-lg bg-canvas border border-line px-3 py-2.5 text-sm text-ink placeholder-ink-4 outline-none focus:border-primary"
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={newWatts}
              onChange={e => setNewWatts(e.target.value)}
              placeholder="Wattage (e.g. 1500)"
              className="flex-1 rounded-lg bg-canvas border border-line px-3 py-2 text-sm text-ink placeholder-ink-4 outline-none focus:border-primary"
            />
            <span className="text-sm text-ink-3 shrink-0">W</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={addAppliance}
              disabled={!newName.trim() || !newWatts}
              className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-on-primary disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewName(''); setNewWatts(''); }}
              className="flex-1 rounded-lg bg-raised py-2.5 text-sm text-ink-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {appliances.length === 0 && !showAdd && (
        <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center">
          <BoltIcon className="w-8 h-8 text-ink-5 mx-auto mb-2" />
          <p className="text-sm font-medium text-ink mb-1">No appliances yet</p>
          <p className="text-xs text-ink-3 mb-4 max-w-xs mx-auto">
            Add each device, then toggle it on when you switch it on and off when you switch it off. Cost accumulates in real time.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary"
          >
            <PlusIcon className="w-4 h-4" /> Add first appliance
          </button>
        </div>
      )}

      {/* Appliance rows */}
      {appliances.length > 0 && (
        <div className="space-y-2">
          {appliances.map(a => {
            const minutes = getApplianceMinutes(a, settings.cycleStartDay);
            const cost = (a.wattage * (minutes / 60) / 1000) * electricityRate;
            const isEditing = editId === a.id;

            return (
              <div
                key={a.id}
                className={`rounded-xl border transition-colors ${
                  a.enabled
                    ? 'bg-primary-tint border-primary-edge'
                    : 'bg-surface border-line'
                }`}
              >
                {isEditing ? (
                  <div className="px-4 py-3 space-y-2.5">
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      autoFocus
                      className="w-full rounded-lg bg-canvas border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary"
                    />
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={editWatts}
                        onChange={e => setEditWatts(e.target.value)}
                        className="flex-1 rounded-lg bg-canvas border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary"
                      />
                      <span className="text-sm text-ink-3 shrink-0">W</span>
                      <button onClick={saveEdit}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shrink-0">
                        <CheckIcon className="w-4 h-4 text-on-primary" />
                      </button>
                      <button onClick={() => setEditId(null)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-raised shrink-0">
                        <XIcon className="w-4 h-4 text-ink-2" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    {/* Toggle */}
                    <button
                      onClick={() => toggleAppliance(a.id)}
                      className={`relative h-8 w-14 rounded-full shrink-0 transition-colors duration-200 ${
                        a.enabled ? 'bg-primary' : 'bg-line-strong'
                      }`}
                    >
                      <div className={`absolute top-1 h-6 w-6 rounded-full bg-white elev-knob transition-all duration-200 ${
                        a.enabled ? 'left-[30px]' : 'left-1'
                      }`} />
                    </button>

                    {/* Name + wattage */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{a.name}</p>
                      <p className="text-xs text-ink-3">{a.wattage}W</p>
                    </div>

                    {/* Cost + duration */}
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold ${cost > 0 ? 'text-ink' : 'text-ink-4'}`}>
                        {fmt(cost)}
                      </p>
                      <p className={`text-xs ${a.enabled ? 'text-primary-text' : 'text-ink-4'}`}>
                        {a.enabled
                          ? `on · ${formatDuration(minutes)}`
                          : minutes > 0
                            ? formatDuration(minutes) + ' this cycle'
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
                            ? 'bg-primary-tint text-primary-text'
                            : 'hover:bg-line text-ink-4 hover:text-ink-2'
                        }`}
                      >
                        <HomeIcon className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => startEdit(a)}
                        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-line transition-colors">
                        <PencilIcon className="w-3.5 h-3.5 text-ink-3" />
                      </button>
                      <button onClick={() => removeAppliance(a.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-line transition-colors">
                        <TrashIcon className="w-3.5 h-3.5 text-danger-text/50 hover:text-danger-text" />
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
  );
}
