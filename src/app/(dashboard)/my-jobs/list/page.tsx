import { getMyJobsData } from "../_data";
import { MyJobsList } from "@/components/my-jobs/MyJobsList";
import { RefreshButton } from "@/components/my-jobs/RefreshButton";

export default async function MyJobsListPage() {
  const { myAssignments, openAssignments, isCleaner, myApartmentNames } = await getMyJobsData();
  return (
    <div className="space-y-4">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.02em" }}>
            Liste
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", marginTop: 2 }}>
            Alle Reinigungsaufträge chronologisch
          </p>
        </div>
        <RefreshButton />
      </div>
      <MyJobsList myAssignments={myAssignments} openAssignments={openAssignments} isCleaner={isCleaner} myApartmentNames={myApartmentNames} />
    </div>
  );
}
