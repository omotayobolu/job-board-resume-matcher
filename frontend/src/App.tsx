import { Route, Routes } from "react-router";
import Login from "./features/login";
import Dashboard from "./features/dashboard";
import Redirect from "./features/redirect";
import SelectRole from "./features/select-role";
import ProtectedRoute from "./features/protected-route";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Redirect />} />
      <Route path="login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="select-role" element={<SelectRole />} />
        <Route path="dashboard" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}

export default App;
