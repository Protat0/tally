'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useApp, PaydayCycle } from '@/components/AppContext';
import { useAuth } from '@/components/AuthContext';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import { PlusIcon, LogOutIcon, BoltIcon, ChevronRightIcon } from '@/components/Icons';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3 px-1">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SettingRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-[#111827] border border-[#1e2d40] px-4 py-3.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, placeholder = '0' }: { value: number; onChange: (v: number) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      value={value || ''}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      placeholder={placeholder}
      className="w-32 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-1.5 text-right text-sm text-white outline-none focus:border-blue-500/50"
    />
  );
}

export default function SettingsPage() {
  const { settings, updateSettings } = useApp();
  const { signOut, user } = useAuth();

  const [customPayday, setCustomPayday] = useState('');

  const addCustomPayday = () => {
    const d = parseInt(customPayday);
    if (isNaN(d) || d < 1 || d > 31 || settings.customPaydays.includes(d)) return;
    updateSettings({ customPaydays: [...settings.customPaydays, d].sort((a, b) => a - b) });
    setCustomPayday('');
  };

  const removeCustomPayday = (d: number) =>
    updateSettings({ customPaydays: settings.customPaydays.filter(x => x !== d) });

  const CYCLES: { key: PaydayCycle; label: string }[] = [
    { key: '1st-15th', label: '1st & 15th' },
    { key: 'monthly', label: 'Monthly (1st)' },
    { key: 'custom', label: 'Custom days' },
  ];

  return (
    <div className="min-h-screen bg-[#0b0f1a]">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-2xl px-4 md:px-8 pb-28 md:pb-12">

          <PageHeader title="Settings" />

          {/* Income */}
          <Section title="Income">
            <SettingRow label="Monthly Income" sub="Your take-home pay each month">
              <NumInput value={settings.monthlyIncome} onChange={v => updateSettings({ monthlyIncome: v })} />
            </SettingRow>
            <SettingRow label="Currency symbol">
              <input
                type="text"
                value={settings.currency}
                onChange={e => updateSettings({ currency: e.target.value })}
                className="w-16 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-1.5 text-center text-sm text-white outline-none focus:border-blue-500/50"
                maxLength={3}
              />
            </SettingRow>
          </Section>

          {/* Payday */}
          <Section title="Payday Cycle">
            <div className="rounded-xl bg-[#111827] border border-[#1e2d40] p-4">
              <div className="flex gap-2 mb-4">
                {CYCLES.map(c => (
                  <button
                    key={c.key}
                    onClick={() => updateSettings({ paydayCycle: c.key })}
                    className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${settings.paydayCycle === c.key ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400'}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {settings.paydayCycle === 'custom' && (
                <div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {settings.customPaydays.map(d => (
                      <div key={d} className="flex items-center gap-1 rounded-full bg-blue-500/15 border border-blue-500/30 pl-3 pr-1.5 py-1">
                        <span className="text-xs text-blue-300">Day {d}</span>
                        <button onClick={() => removeCustomPayday(d)} className="ml-0.5 text-blue-400 hover:text-blue-200">×</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={customPayday}
                      onChange={e => setCustomPayday(e.target.value)}
                      placeholder="Day (1–31)"
                      min={1} max={31}
                      className="flex-1 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 placeholder-slate-500"
                    />
                    <button onClick={addCustomPayday} className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
                      <PlusIcon className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* Emergency fund */}
          <Section title="Emergency Fund">
            <SettingRow label="Target amount" sub="Your total savings goal">
              <NumInput value={settings.emergencyFundTarget} onChange={v => updateSettings({ emergencyFundTarget: v })} />
            </SettingRow>
          </Section>

          {/* Tools */}
          <Section title="Tools">
            <Link
              href="/electric"
              className="flex items-center gap-4 rounded-xl bg-[#111827] border border-[#1e2d40] px-4 py-3.5 hover:bg-[#1a2332] transition-colors"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 shrink-0">
                <BoltIcon className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Electric Bill Estimator</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {settings.appliances.length > 0
                    ? `${settings.appliances.length} appliance${settings.appliances.length !== 1 ? 's' : ''} configured`
                    : 'Add appliances to estimate your bill'}
                </p>
              </div>
              <ChevronRightIcon className="w-4 h-4 text-slate-600 shrink-0" />
            </Link>
          </Section>

          {/* Account — mobile sign-out */}
          <div className="mt-2 md:hidden">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3 px-1">Account</p>
            {user && <p className="text-xs text-slate-500 mb-3 px-1">{user.email}</p>}
            <button
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3.5 text-red-400 active:bg-red-500/20 transition-colors"
            >
              <LogOutIcon className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium">Sign out</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
