import { useEffect, useState } from "react";
import { formatTimeLeft } from "../lib/speedrun-labels";

export function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="tabular" suppressHydrationWarning>
      {formatTimeLeft(new Date(until).getTime() - now)}
    </span>
  );
}
