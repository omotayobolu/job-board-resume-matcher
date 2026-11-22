import Landing from "@/features/landing";
import { getHomePath } from "@/lib/auth";
import { axiosInstance } from "@/lib/axios-instance";
import type { UserType } from "@/store/userSlice";
import { useEffect, useState } from "react";

/** Public home. The landing page renders immediately; a session check only relabels the header. */
const Home = () => {
  const [homePath, setHomePath] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    axiosInstance
      .get<{ user: UserType }>("/auth/me")
      .then((res) => {
        if (!active || !res.data.user?.id) return;
        setHomePath(getHomePath(res.data.user));
      })
      .catch(() => {
        // Keep the landing page when the API is down or the visitor is signed out.
      });
    return () => {
      active = false;
    };
  }, []);

  return <Landing homePath={homePath} />;
};

export default Home;
