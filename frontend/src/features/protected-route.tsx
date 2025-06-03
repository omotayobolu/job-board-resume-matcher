import Loading from "@/components/loading";
import { clearUser, selectUser, setUser } from "@/store/userSlice";
import axios from "axios";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, Outlet, useLocation } from "react-router";

const ProtectedRoute = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const user = useSelector(selectUser);
  const [loading, setLoading] = useState(true);
  console.log(user);
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

  if (
    user.role === "job seeker" &&
    location.pathname !== "/jobseeker-profile"
  ) {
    return <Navigate to="/jobseeker-profile" />;
  }

  if (user.role === "recruiter" && location.pathname !== "/recruiter-profile") {
    return <Navigate to="/recruiter-profile" />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
