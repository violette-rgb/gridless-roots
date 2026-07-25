import { motion } from "framer-motion";

interface Props {
  label: string;
  value: number;
  values: number[];
  onChange: (v: number) => void;
  unit?: string;
}

export function AxisSlider({ label, value, values, onChange, unit }: Props) {
  const index = Math.max(0, values.indexOf(value));
  return (
    <div className="group">
      <div className="flex items-baseline justify-between">
        <span className="label-xs">{label}</span>
        <span className="num text-sm font-light tracking-tight text-foreground/85">
          {value.toLocaleString("en-US")}
          {unit ? <span className="ml-1 opacity-40">{unit}</span> : null}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={values.length - 1}
        step={1}
        value={index}
        onChange={(e) => onChange(values[Number(e.target.value)])}
        aria-label={label}
        className="mt-3 h-[2px] w-full cursor-pointer appearance-none rounded-full bg-foreground/15 outline-none
          [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary
          [&::-webkit-slider-thumb]:shadow-[0_0_12px_var(--primary)] [&::-webkit-slider-thumb]:transition-transform
          hover:[&::-webkit-slider-thumb]:scale-125
          [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary"
      />
      <motion.div
        className="mt-2 flex justify-between text-[10px] text-foreground/25"
        initial={false}
      >
        <span className="num">{values[0].toLocaleString("en-US")}</span>
        <span className="num">
          {values[values.length - 1].toLocaleString("en-US")}
        </span>
      </motion.div>
    </div>
  );
}
