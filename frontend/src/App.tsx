import { Route, Routes } from "react-router";
import Login from "./features/login";
import Dashboard from "./features/dashboard";

function App() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route path="dashboard" element={<Dashboard />} />
    </Routes>
  );
}

export default App;
