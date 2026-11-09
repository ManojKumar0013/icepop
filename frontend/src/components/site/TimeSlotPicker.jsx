import { useEffect, useMemo, useState } from "react";
import { Calendar, CheckCircle2, Clock } from "lucide-react";

const SLOTS = [
  { id: "11-13", label: "11:00 AM – 01:00 PM", startHour: 11, startMinute: 0, endHour: 13, endMinute: 0, timeStr: "11:00" },
  { id: "13-15", label: "01:00 PM – 03:00 PM", startHour: 13, startMinute: 0, endHour: 15, endMinute: 0, timeStr: "13:00" },
  { id: "15-17", label: "03:00 PM – 05:00 PM", startHour: 15, startMinute: 0, endHour: 17, endMinute: 0, timeStr: "15:00" },
  { id: "17-19", label: "05:00 PM – 07:00 PM", startHour: 17, startMinute: 0, endHour: 19, endMinute: 0, timeStr: "17:00" },
  { id: "19-21", label: "07:00 PM – 09:00 PM", startHour: 19, startMinute: 0, endHour: 21, endMinute: 0, timeStr: "19:00" },
  { id: "21-2230", label: "09:00 PM – 10:30 PM", startHour: 21, startMinute: 0, endHour: 22, endMinute: 30, timeStr: "21:00" },
];

export const TimeSlotPicker = ({ value, onChange }) => {
  // Compute current date/time in IST (UTC+5:30)
  const getISTNow = () => {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 5.5));
  };

  const istNow = getISTNow();

  // Generate 3 days
  const days = useMemo(() => {
    const list = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(istNow);
      d.setDate(d.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const dateKey = `${yyyy}-${mm}-${dd}`;
      const dayName = i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-IN", { weekday: "short" });
      const displayDate = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      list.push({ index: i, dateKey, dayName, displayDate, fullDate: d });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    const currentHour = istNow.getHours() + (istNow.getMinutes() / 60);
    const hasTodaySlot = SLOTS.some((s) => s.endHour > currentHour + 0.5);
    return hasTodaySlot ? 0 : 1;
  });

  const [selectedSlotId, setSelectedSlotId] = useState("");

  const handleSelectSlot = (slot) => {
    setSelectedSlotId(slot.id);
    const day = days[selectedDayIndex];
    onChange(`${day.dateKey}T${slot.timeStr}`);
  };

  const handleDayChange = (idx) => {
    setSelectedDayIndex(idx);
    setSelectedSlotId("");
    onChange("");
  };

  const selectedDay = days[selectedDayIndex];
  const currentHourFloat = istNow.getHours() + (istNow.getMinutes() / 60);

  return (
    <div className="space-y-4 rounded-3xl border border-border bg-white p-4 sm:p-5 shadow-xs mb-4" data-testid="time-slot-picker">
      {/* Date selection tabs */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-strawberry" /> Select delivery day
        </p>
        <div className="grid grid-cols-3 gap-2">
          {days.map((d) => (
            <button
              key={d.dateKey}
              type="button"
              data-testid={`slot-day-${d.index}`}
              onClick={() => handleDayChange(d.index)}
              className={`flex flex-col items-center justify-center rounded-2xl border-2 py-2.5 px-2 text-center transition-all ${
                selectedDayIndex === d.index
                  ? "border-choco bg-cream-deep font-bold text-choco shadow-xs"
                  : "border-border/80 hover:border-choco/50 text-muted-foreground"
              }`}
            >
              <span className="text-xs font-bold text-foreground">{d.dayName}</span>
              <span className="text-[11px] text-muted-foreground mt-0.5">{d.displayDate}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Time slots grid */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-strawberry" /> Choose delivery slot (11:00 AM – 10:30 PM)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SLOTS.map((s) => {
            const isToday = selectedDayIndex === 0;
            const isPassed = isToday && s.endHour <= currentHourFloat + 0.3;
            const isSelected = selectedSlotId === s.id;

            return (
              <button
                key={s.id}
                type="button"
                disabled={isPassed}
                data-testid={`slot-time-${s.id}`}
                onClick={() => handleSelectSlot(s)}
                className={`flex flex-col items-center justify-center rounded-2xl border-2 p-2.5 text-center text-xs font-bold transition-all disabled:opacity-35 disabled:cursor-not-allowed ${
                  isSelected
                    ? "border-strawberry bg-strawberry text-white shadow-sm scale-[1.02]"
                    : "border-border bg-white hover:border-choco text-choco"
                }`}
              >
                <span>{s.label}</span>
                {isPassed && <span className="text-[10px] text-muted-foreground font-normal mt-0.5">Closed today</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Slot Confirmation Pill */}
      {value ? (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200/90 p-3 text-xs font-bold text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>Scheduled for: {selectedDay?.dayName} ({selectedDay?.displayDate}) · {SLOTS.find((s) => s.id === selectedSlotId)?.label || value}</span>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground italic">Please tap an available slot above.</p>
      )}

      {/* Controlled input accessible for tests and forms */}
      <input
        type="text"
        data-testid="checkout-preferred-time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
};
