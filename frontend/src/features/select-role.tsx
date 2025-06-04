import OnboardingDesign from "@/components/onboarding-design";
import { Button } from "@/components/ui/button";
import { selectUser, setUser } from "@/store/userSlice";
import axios from "axios";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router";

const SelectRole = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const handleRoleSelection = (role: string) => {
    setSelectedRole(role);
  };

  const updateRole = async () => {
    if (!selectedRole) return;

    try {
      const response = await axios.patch(
        `${import.meta.env.VITE_API_URL}/user/update-role`,
        {
          email: user.email,
          role: selectedRole,
        },
        {
          withCredentials: true,
        }
      );
      if (response.status === 200) {
        dispatch(setUser({ ...user, role: selectedRole }));
        navigate(
          selectedRole === "recruiter"
            ? "/recruiter-profile"
            : "/jobseeker-profile"
        );
      }
    } catch (error) {
      console.error("Error updating role:", error);
    }
  };

  return (
    <div className="w-full min-h-screen h-full flex flex-row">
      <OnboardingDesign />
      <div className="bg-light-grey flex justify-center items-center lg:w-[60%] w-full px-4">
        <div className="bg-white min-h-[485px] w-full sm:w-[600px] md:w-[700px] lg:w-[800px] max-w-full pt-20 rounded-3xl drop-shadow-[0px_6px_40px_rgba(245,245,245,1)]">
          <h2 className="text-dark-grey text-3xl text-center font-medium">
            Which best describes you?
          </h2>
          <div className="mt-10 flex flex-row items-center justify-center gap-12">
            <button
              onClick={() => handleRoleSelection("recruiter")}
              className={`relative h-[190px] w-[283px] ${
                selectedRole === "recruiter"
                  ? "border-[1.5px] border-purple bg-[rgba(248,247,253,1)]"
                  : "border-[0.7px] border-dark-grey"
              }  rounded-[12px] flex justify-center items-center p-6 cursor-pointer `}
            >
              <div
                className={`absolute top-4 right-4 w-[20px] h-[20px] border-[0.7px]  rounded-full  ${
                  selectedRole === "recruiter"
                    ? "bg-purple border-purple"
                    : "border-dark-grey"
                }`}
              >
                <div className="absolute top-1.25 right-1.25 w-2 h-2 bg-white rounded-[8px]"></div>
              </div>
              <p className="text-dark-grey font-normal text-2xl text-center">
                I am a recruiter, hiring talent for a job
              </p>
            </button>
            <button
              onClick={() => handleRoleSelection("job seeker")}
              className={`relative h-[190px] w-[283px] ${
                selectedRole === "job seeker"
                  ? "border-[1.5px] border-purple bg-[rgba(248,247,253,1)]"
                  : "border-[0.7px] border-dark-grey"
              }  rounded-[12px] flex justify-center items-center p-6 cursor-pointer `}
            >
              <div
                className={`absolute top-4 right-4 w-[20px] h-[20px] border-[0.7px]  rounded-full  ${
                  selectedRole === "job seeker"
                    ? "bg-purple border-purple"
                    : "border-dark-grey"
                }`}
              >
                <div className="absolute top-1.25 right-1.25 w-2 h-2 bg-white rounded-[8px]"></div>
              </div>
              <p className="text-dark-grey font-normal text-2xl text-center">
                I am a job seeker, searching for a job
              </p>
            </button>
          </div>
          <div
            className={`text-center mt-12 mb-20 ${
              !selectedRole ? "hidden" : ""
            }`}
          >
            <Button
              onClick={updateRole}
              variant="primary"
              size="lg"
              className="font-normal"
            >
              Join as a{" "}
              {selectedRole === "recruiter" ? "Recruiter" : "Job Seeker"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectRole;
