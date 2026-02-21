export function Slider({
  id,
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  displayValue,
  onInput,
}: {
  id?: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  displayValue?: string;
  onInput: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm text-gray-300">
          {label}
        </label>
        {displayValue !== undefined && (
          <span className="text-sm text-gray-400">{displayValue}</span>
        )}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(e) => onInput(parseFloat(e.currentTarget.value))}
        className={[
          "h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-600 accent-blue-500",
          "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-none [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:cursor-pointer",
          "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:cursor-pointer",
          "[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded",
          "[&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded",
        ].join(" ")}
      />
    </div>
  );
}
