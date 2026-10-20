import Loading from "@/components/loading";
import { getHomePath } from "@/lib/auth";
import { axiosInstance } from "@/lib/axios-instance";
import { clearUser, selectUser, setUser } from "@/store/userSlice";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, Outlet, useLocation } from "react-router";

const PROFILE_PATHS = ["/recruiter-profile", "/jobseeker-profile"];

const ProtectedRoute = () => {
  const { pathname } = useLocation();

  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axiosInstance
      .get("/auth/me")
      .then((res) => {
        dispatch(setUser(res.data.user));
      })
      .catch((error) => {
        console.error("Error during authentication check:", error);
        dispatch(clearUser());
      })
      .finally(() => setLoading(false));
  }, [dispatch]);

  if (loading) {
    return <Loading />;
  }

  if (!user?.id) {
    return <Navigate to="/login" />;
  }

  // Onboarding: no role -> login, role without a profile -> that profile form,
  // otherwise the dashboard. Each of those pages is only reachable in its own state.
  const home = getHomePath(user);
  const isDashboard =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const requiredHome = isDashboard
    ? "/dashboard"
    : PROFILE_PATHS.includes(pathname)
      ? pathname
      : null;

  if (requiredHome && requiredHome !== home) {
    return <Navigate to={home} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
