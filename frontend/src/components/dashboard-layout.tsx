import { jobSeekerFeaturesEnabled } from "@/lib/features";
import { selectUser } from "@/store/userSlice";
import { useSelector } from "react-redux";
import RecruiterSidebar from "./recruiter-sidebar";
import { Outlet } from "react-router";
import JobseekerSidebar from "./jobseeker-sidebar";

const DashboardLayout = () => {
  const user = useSelector(selectUser);
  const showRecruiterNav = user.role === "recruiter";
  const showSeekerNav = user.role !== "recruiter" && jobSeekerFeaturesEnabled();
  const showNav = showRecruiterNav || showSeekerNav;

  return (
    <div className="w-full min-h-screen h-full flex flex-row bg-[rgba(245,247,251,1)] font-inter">
      {showRecruiterNav ? (
        <RecruiterSidebar />
      ) : showSeekerNav ? (
        <JobseekerSidebar />
      ) : null}
      <div className={showNav ? "w-[85%] ml-[15%]" : "w-full"}>
        <Outlet />
      </div>
    </div>
  );
};

export default DashboardLayout;
