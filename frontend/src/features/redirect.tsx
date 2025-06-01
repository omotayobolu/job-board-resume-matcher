import Loading from "@/components/loading";
import axios from "axios";
import { useEffect, useState } from "react";
import { Navigate } from "react-router";

const Redirect = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    axios
      .get("http://localhost:3000/api/v1/auth/check", {
        withCredentials: true,
      })
      .then((res) => {
        if (res.status === 200) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error during authentication check:", error);
        setIsAuthenticated(false);
        setLoading(false);
      });
  }, []);
  if (loading) {
    return <Loading />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return isAuthenticated ? (
    <Navigate to="/dashboard" />
  ) : (
    <Navigate to="/login" />
  );
};

export default Redirect;
