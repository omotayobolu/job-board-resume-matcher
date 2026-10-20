import { Route, Routes } from "react-router";
import SignIn from "./features/sign-in";
import SignUp from "./features/sign-up";
import Dashboard from "./features/dashboard";
import Redirect from "./features/redirect";
import ProtectedRoute from "./features/protected-route";
import RecruiterProfile from "./features/create-recruiters-profile";
import JobseekerProfile from "./features/create-jobseeker-profile";
import DashboardLayout from "./components/dashboard-layout";
import Messages from "./features/messages";
import JobApplicants from "./features/applicants";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Redirect />} />
      <Route path="login" element={<SignIn />} />
      <Route path="signup" element={<SignUp />} />
      <Route element={<ProtectedRoute />}>
        <Route path="recruiter-profile" element={<RecruiterProfile />} />
        <Route path="jobseeker-profile" element={<JobseekerProfile />} />
        <Route path="dashboard" element={<DashboardLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="applicants/:jobId" element={<JobApplicants />} />
          <Route path="messages/" element={<Messages />} />
          <Route path="messages/:userId" element={<Messages />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
