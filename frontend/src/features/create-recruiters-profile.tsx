import OnboardingDesign from "@/components/onboarding-design";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { selectUser } from "@/store/userSlice";
import axios from "axios";
import { useForm, Controller } from "react-hook-form";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router";
import { toast } from "sonner";

interface recruiterProfileForm {
  companyName: string;
  companyLocation: string;
  organizationType: string;
}

const RecruiterProfile = () => {
  const user = useSelector(selectUser);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<recruiterProfileForm>({
    mode: "onTouched",
  });

  const onsubmit = async (data: recruiterProfileForm) => {
    console.log(data);
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/recruiter/create-profile`,
        {
          user_id: user.id,
          company_name: data.companyName,
          location: data.companyLocation,
          type_of_organization: data.organizationType,
        },
        {
          withCredentials: true,
        }
      );
      if (response.status === 200) {
        console.log("Recruiter profile created successfully", response.data);
        toast.success(response.data.message);
        navigate("/dashboard");
      } else {
        console.error("Failed to create recruiter profile");
      }
      console.log("Recruiter profile created:", response.data);
    } catch (error) {
      console.error("Error creating recruiter profile:", error);
    }
  };
  return (
    <div className="w-full min-h-screen h-full flex flex-row">
      <OnboardingDesign />
      <div className="bg-light-grey flex justify-center items-center lg:w-[60%] w-full px-4">
        <div className="bg-white min-h-[485px] w-full sm:w-[600px] md:w-[700px] lg:w-[800px] max-w-full pt-20 rounded-3xl drop-shadow-[0px_6px_40px_rgba(245,245,245,1)] flex justify-center">
          <form
            onSubmit={handleSubmit(onsubmit)}
            className="lg:w-[600px] w-full px-8"
          >
            <div className="">
              <label
                htmlFor="companyName"
                className="mb-2 text-dark-grey text-lg font-medium leading-normal"
              >
                What is the name of your company?
              </label>
              <Input
                id="companyName"
                type="text"
                placeholder="Company Name"
                {...register("companyName", {
                  required: "Please enter your company name.",
                })}
                className={`${errors.companyName ? "border-red" : ""}`}
              />
              {errors.companyName && (
                <p className="text-red text-sm">
                  {errors.companyName?.message as string}
                </p>
              )}
            </div>
            <div className="mt-6">
              <label
                htmlFor="companyLocation"
                className="mb-2 text-dark-grey text-lg font-medium leading-normal"
              >
                Where is your company located?
              </label>
              <Input
                id="companyLocation"
                type="text"
                placeholder="Company Location"
                {...register("companyLocation", {
                  required: "Please enter your company location.",
                })}
                className={`${errors.companyLocation ? "border-red" : ""}`}
              />
              {errors.companyLocation && (
                <p className="text-red text-sm">
                  {errors.companyLocation?.message as string}
                </p>
              )}
            </div>
            <div className="mt-6">
              <label
                htmlFor="companyLocation"
                className="mb-2 text-dark-grey text-lg font-medium leading-normal"
              >
                Type of organization
              </label>
              <Controller
                name="organizationType"
                control={control}
                rules={{ required: "Please select an organization type." }}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger
                      className={`${
                        errors.organizationType
                          ? "border-red"
                          : "border-gray-300"
                      }`}
                    >
                      <SelectValue placeholder="Select an organization type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company">Company</SelectItem>
                      <SelectItem value="startup">Startup</SelectItem>
                      <SelectItem value="solopreneur">Solopreneur</SelectItem>
                      <SelectItem value="agency">Agency</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.organizationType && (
                <p className="text-red text-sm">
                  {errors.organizationType.message as string}
                </p>
              )}
            </div>
            {/* <div className="mt-6">
              <label
                htmlFor="companyLocation"
                className="mb-2 text-dark-grey text-lg font-medium leading-normal"
              >
                Area of specialization
              </label>
              <Controller
                name="specialization"
                control={control}
                rules={{ required: "Please select an area of specialization." }}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger
                      className={`${
                        errors.specialization ? "border-red" : "border-gray-300"
                      }`}
                    >
                      <SelectValue placeholder="Select area of specialization" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="education">Education</SelectItem>
                      <SelectItem value="healthcare">Healthcare</SelectItem>
                      <SelectItem value="tech">Tech</SelectItem>
                      <SelectItem value="construction">Construction</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.specialization && (
                <p className="text-red text-sm">
                  {errors.specialization.message as string}
                </p>
              )}
            </div> */}
            <div className="my-16 text-center">
              <Button variant="primary" className="py-8 px-16 text-xl">
                Create Profile
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RecruiterProfile;
