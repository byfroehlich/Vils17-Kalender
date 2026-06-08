import { getMyJobsData } from "../_data";
import { MyJobsList } from "@/components/my-jobs/MyJobsList";

export default async function MyJobsListPage() {
  const { myAssignments, openAssignments, isCleaner } = await getMyJobsData();
  return (
    <div className="space-y-4">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.02em" }}>
          Liste
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", marginTop: 2 }}>
          Alle Reinigungsaufträge chronologisch
        </p>
      </div>
      <MyJobsList myAssignments={myAssignments} openAssignments={openAssignments} isCleaner={isCleaner} />
    </div>
  );
}
