'use client';
import * as React from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dayjs } from '@/lib/utils';

export const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

const axis = { tick: { fontSize: 11, fill: 'var(--muted-foreground)' }, axisLine: false, tickLine: false } as const;

function TooltipBox({ active, payload, label, formatter }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string; dataKey?: string }>; label?: string; formatter?: (v: number, name: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-xl border px-3 py-2 text-xs shadow-xl">
      {label && <div className="text-muted-foreground mb-1 font-medium">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="tabular ml-auto font-semibold">{formatter ? formatter(p.value, p.name) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function AreaTrend({ data, xKey, series, height = 260, xFormat = (v: string) => dayjs(v).format('DD.MM'), yDomain, formatter }: { data: object[]; xKey: string; series: Array<{ key: string; name: string; color?: string }>; height?: number; xFormat?: (v: string) => string; yDomain?: [number | 'auto', number | 'auto']; formatter?: (v: number, n: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? COLORS[i]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color ?? COLORS[i]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={xKey} {...axis} tickFormatter={xFormat} minTickGap={24} />
        <YAxis {...axis} domain={yDomain} width={44} />
        <Tooltip content={<TooltipBox formatter={formatter} />} labelFormatter={(l) => xFormat(String(l))} />
        {series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? COLORS[i]} strokeWidth={2} fill={`url(#grad-${s.key})`} dot={false} activeDot={{ r: 4 }} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LineTrend({ data, xKey, series, height = 260, xFormat = (v: string) => dayjs(v).format('DD.MM'), yDomain, formatter }: { data: object[]; xKey: string; series: Array<{ key: string; name: string; color?: string }>; height?: number; xFormat?: (v: string) => string; yDomain?: [number | 'auto', number | 'auto']; formatter?: (v: number, n: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={xKey} {...axis} tickFormatter={xFormat} minTickGap={24} />
        <YAxis {...axis} domain={yDomain} width={44} />
        <Tooltip content={<TooltipBox formatter={formatter} />} labelFormatter={(l) => xFormat(String(l))} />
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? COLORS[i]} strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: s.color ?? COLORS[i] }} activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Bars({ data, xKey, series, height = 260, horizontal, stacked, xFormat, formatter, colorful }: { data: object[]; xKey: string; series: Array<{ key: string; name: string; color?: string }>; height?: number; horizontal?: boolean; stacked?: boolean; xFormat?: (v: string) => string; formatter?: (v: number, n: string) => string; colorful?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 8, left: horizontal ? 8 : -18, bottom: 0 }} barCategoryGap={horizontal ? 6 : '25%'}>
        <CartesianGrid horizontal={!horizontal} vertical={horizontal} strokeDasharray="3 3" />
        {horizontal ? (
          <>
            <XAxis type="number" {...axis} />
            <YAxis type="category" dataKey={xKey} {...axis} width={120} tickFormatter={xFormat} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} {...axis} tickFormatter={xFormat} interval={0} minTickGap={8} />
            <YAxis {...axis} width={44} />
          </>
        )}
        <Tooltip content={<TooltipBox formatter={formatter} />} cursor={{ fill: 'var(--accent)' }} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color ?? COLORS[i]} radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} stackId={stacked ? 'a' : undefined} maxBarSize={40}>
            {colorful && data.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 220, innerRadius = 58, outerRadius = 84, centerLabel, centerValue }: { data: Array<{ name: string; value: number; color?: string }>; height?: number; innerRadius?: number; outerRadius?: number; centerLabel?: string; centerValue?: React.ReactNode }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={innerRadius} outerRadius={outerRadius} paddingAngle={3} cornerRadius={6} stroke="none">
            {data.map((d, i) => (
              <Cell key={d.name} fill={d.color ?? COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<TooltipBox formatter={(v) => `${v} (${total ? Math.round((v / total) * 100) : 0}%)`} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="tabular text-2xl font-semibold">{centerValue ?? total}</div>
        {centerLabel && <div className="text-muted-foreground text-xs">{centerLabel}</div>}
      </div>
    </div>
  );
}

export function Gauge({ value, max = 100, height = 160, label, color }: { value: number; max?: number; height?: number; label?: string; color?: string }) {
  const pctV = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ value: pctV, fill: color ?? 'var(--chart-1)' }]} startAngle={210} endAngle={-30}>
          <RadialBar dataKey="value" background={{ fill: 'var(--accent)' }} cornerRadius={10} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-4">
        <div className="tabular text-3xl font-semibold">{Math.round(value)}{max === 100 ? '%' : ''}</div>
        {label && <div className="text-muted-foreground text-xs">{label}</div>}
      </div>
    </div>
  );
}

export function Sparkline({ data, dataKey, color = 'var(--chart-1)', height = 40 }: { data: object[]; dataKey: string; color?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#spark-${dataKey})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ChartLegend({ items }: { items: Array<{ name: string; color: string; value?: React.ReactNode }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: i.color }} />
          <span className="text-muted-foreground">{i.name}</span>
          {i.value !== undefined && <span className="tabular font-medium">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}
