import Loading from "@/components/loading";
import { clearUser, selectUser, setUser } from "@/store/userSlice";
import axios from "axios";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, Outlet, useLocation } from "react-router";

const ProtectedRoute = () => {
  const location = useLocation();

  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get(`${import.meta.env.VITE_API_URL}/auth/check`, {
        withCredentials: true,
      })
      .then((res) => {
        if (res.status === 200) {
          dispatch(setUser(res.data.user));
        } else {
          dispatch(clearUser());
        }
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error during authentication check:", error);
        dispatch(clearUser());
        setLoading(false);
      });
  }, [dispatch]);

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  const pathname = location.pathname;

  if (pathname === "/select-role" && user.role) {
    return <Navigate to="/dashboard" />;
  }

  if (
    ["/recruiter-profile", "/jobseeker-profile"].includes(pathname) &&
    (!user.role || user.hasprofile)
  ) {
    return <Navigate to={user.hasprofile ? "/dashboard" : "/select-role"} />;
  }

  if (pathname === "/dashboard") {
    if (!user.role) {
      return <Navigate to="/select-role" />;
    }
    if (!user.hasprofile) {
      return (
        <Navigate
          to={
            user.role === "recruiter"
              ? "/recruiter-profile"
              : "/jobseeker-profile"
          }
        />
      );
    }
  }

  return <Outlet />;
};

export default ProtectedRoute;
