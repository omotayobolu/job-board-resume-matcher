import { selectUser } from "@/store/userSlice";
import { useSelector } from "react-redux";
import RecruiterSidebar from "./recruiter-sidebar";
import { Outlet } from "react-router";
import { useState } from "react";
import PostJobDIalog from "./post-job-dialog";
import JobseekerSidebar from "./jobseeker-sidebar";

const DashboardLayout = () => {
  const user = useSelector(selectUser);
  const [openDialog, setOpenDialog] = useState(false);

  return (
    <div className="w-full min-h-screen h-full flex flex-row bg-[rgba(245,247,251,1)] font-inter">
      {user.role === "recruiter" ? (
        <RecruiterSidebar dialogOpen={() => setOpenDialog(true)} />
      ) : (
        <JobseekerSidebar />
      )}
      <div className="w-[85%] ml-[15%]">
        <Outlet />
        <PostJobDIalog openDialog={openDialog} setOpenDialog={setOpenDialog} />
      </div>
    </div>
  );
};

export default DashboardLayout;
