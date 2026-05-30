import { getMyJobsData } from "./_data";
import { CleanerDashboard } from "@/components/my-jobs/CleanerDashboard";

export default async function MyJobsPage() {
  const data = await getMyJobsData();
  return <CleanerDashboard {...data} />;
}
