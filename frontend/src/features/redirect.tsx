import Loading from "@/components/loading";
import Landing from "@/features/landing";
import { getHomePath } from "@/lib/auth";
import { axiosInstance } from "@/lib/axios-instance";
import type { UserType } from "@/store/userSlice";
import { useEffect, useState } from "react";
import { Navigate } from "react-router";

const Redirect = () => {
  const [destination, setDestination] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    axiosInstance
      .get<{ user: UserType }>("/auth/me")
      .then((res) => {
        setDestination(getHomePath(res.data.user));
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error during authentication check:", error);
        setLoading(false);
      });
  }, []);
  if (loading) {
    return <Loading />;
  }

  if (!destination) {
    return <Landing />;
  }

  return <Navigate to={destination} replace />;
};

export default Redirect;
