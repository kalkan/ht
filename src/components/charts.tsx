import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { formatShortDateTr } from '../utils/dateUtils';
import { EmptyState } from './ui';

/** Read the current CSS palette so charts match light/dark mode. */
function palette() {
  const css = getComputedStyle(document.documentElement);
  const rgb = (v: string) => `rgb(${css.getPropertyValue(v).trim()})`;
  return {
    accent: rgb('--c-accent'),
    muted: rgb('--c-muted'),
    faint: rgb('--c-faint'),
    line: rgb('--c-line'),
    ink: rgb('--c-ink'),
    card: rgb('--c-card'),
    success: rgb('--c-success'),
  };
}

function ChartTooltip({ active, payload, label, unit }: TooltipProps<number, string> & { unit?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 text-[12px] shadow-md">
      <p className="font-semibold text-ink">{typeof label === 'string' ? formatShortDateTr(label) : label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="text-muted">
          {p.name}: <span className="font-semibold text-ink tabular-nums">{p.value}{unit ?? ''}</span>
        </p>
      ))}
    </div>
  );
}

export function CigaretteChart({ data }: { data: { date: string; value: number; average: number }[] }) {
  if (data.length === 0) return <EmptyState title="Henüz veri yok" hint="Birkaç gün kayıt girince trend burada görünür." />;
  const c = palette();
  const single = data.length === 1;
  return (
    <div className="h-52 w-full" role="img" aria-label="Sigara trendi grafiği">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke={c.line} vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDateTr}
            tick={{ fill: c.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis allowDecimals={false} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.line }} />
          <Line
            type="linear"
            dataKey="value"
            name="Sigara"
            stroke={c.faint}
            strokeWidth={1.5}
            dot={single ? { r: 4, fill: c.faint } : false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="average"
            name="7 gün ort."
            stroke={c.accent}
            strokeWidth={2.5}
            dot={single ? { r: 4, fill: c.accent } : false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeightChart({ data }: { data: { date: string; weight: number }[] }) {
  if (data.length === 0) return <EmptyState title="Kilo kaydı yok" hint="Tartıldığınız günler burada çizilir." />;
  const c = palette();
  const values = data.map((d) => d.weight);
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);
  return (
    <div className="h-52 w-full" role="img" aria-label="Kilo trendi grafiği">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={c.line} vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDateTr}
            tick={{ fill: c.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis domain={[min, max]} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<ChartTooltip unit=" kg" />} cursor={{ stroke: c.line }} />
          <Line
            type="linear"
            dataKey="weight"
            name="Kilo"
            stroke={c.accent}
            strokeWidth={2.5}
            // Show real measurements as dots; missing days are simply absent, never interpolated.
            dot={{ r: 3, fill: c.accent, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WorkoutBars({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <EmptyState title="Spor kaydı yok" />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="flex flex-col gap-2.5" aria-label="Spor dağılımı">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[96px_1fr_auto] items-center gap-3">
          <span className="truncate text-[14px] font-medium text-ink">{d.label}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-elevated" aria-hidden="true">
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="w-10 text-right text-[14px] font-semibold tabular-nums text-ink">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}
