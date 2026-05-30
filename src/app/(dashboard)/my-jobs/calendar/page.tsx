import { getMyJobsData } from "../_data";
import { MyJobsCalendar } from "@/components/my-jobs/MyJobsCalendar";

export default async function MyJobsCalendarPage() {
  const { assignments, isCleaner } = await getMyJobsData();
  return (
    <div className="space-y-4">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.02em" }}>
          Kalender
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", marginTop: 2 }}>
          Jahres- und Monatsübersicht aller Reinigungen
        </p>
      </div>
      <MyJobsCalendar assignments={assignments} isCleaner={isCleaner} />
    </div>
  );
}
