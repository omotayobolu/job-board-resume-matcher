import JobseekerDashboard from "@/components/jobseeker-dashboard";
import RecruiterDashboard from "@/components/recruiter-dashboard";
import { jobSeekerFeaturesEnabled } from "@/lib/features";
import { selectUser } from "@/store/userSlice";
import { useSelector } from "react-redux";

const Dashboard = () => {
  const user = useSelector(selectUser);

  if (user.role === "recruiter") {
    return <RecruiterDashboard />;
  }
  if (jobSeekerFeaturesEnabled()) {
    return <JobseekerDashboard />;
  }
  return (
    <div className="p-10">
      <h1 className="text-2xl font-semibold text-black">Recruiter accounts only</h1>
      <p className="mt-3 text-[#4A4A4A]">
        Shortlistly is for recruiting teams. Job seeker pages are turned off.
      </p>
    </div>
  );
};

export default Dashboard;
