import JobseekerDashboard from "@/components/jobseeker-dashboard";
import RecruiterDashboard from "@/components/recruiter-dashboard";
import { selectUser } from "@/store/userSlice";
import { useSelector } from "react-redux";

const Dashboard = () => {
  const user = useSelector(selectUser);

  if (user.role === "recruiter") {
    return <RecruiterDashboard />;
  } else {
    return <JobseekerDashboard />;
  }
};

export default Dashboard;
