import { Route, Routes } from "react-router";
import Login from "./features/login";
import Dashboard from "./features/dashboard";
import Redirect from "./features/redirect";
import SelectRole from "./features/select-role";
import ProtectedRoute from "./features/protected-route";
import { useDispatch } from "react-redux";
import { useEffect } from "react";
import { fetchUser } from "./store/userSlice";
import type { AppDispatch } from "./store/store";
import RecruiterProfile from "./features/create-recruiters-profile";
import JobseekerProfile from "./features/create-jobseeker-profile";
import DashboardLayout from "./components/dashboard-layout";
import Applicants from "./features/applicants";

function App() {
  const dispatch: AppDispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchUser());
  }, [dispatch]);

  return (
    <Routes>
      <Route path="/" element={<Redirect />} />
      <Route path="login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="select-role" element={<SelectRole />} />
        <Route path="recruiter-profile" element={<RecruiterProfile />} />
        <Route path="jobseeker-profile" element={<JobseekerProfile />} />
        <Route path="dashboard" element={<DashboardLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="applicants" element={<Applicants />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
