import { clearUser } from "@/store/userSlice";
import { useQueryClient } from "@tanstack/react-query";
import { axiosInstance } from "@/lib/axios-instance";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export function useLogout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const logout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await axiosInstance.post("/auth/logout");
      queryClient.clear();
      dispatch(clearUser());
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Could not log out:", error);
      toast.error("Could not log out. Please try again.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  return { logout, isLoggingOut };
}
