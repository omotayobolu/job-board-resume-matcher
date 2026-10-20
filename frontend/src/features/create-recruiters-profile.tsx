import BrandLogo from "@/components/brand-logo";
import CountrySelect from "@/components/country-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { axiosInstance } from "@/lib/axios-instance";
import { selectUser, setUser } from "@/store/userSlice";
import { useForm, Controller } from "react-hook-form";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router";
import { toast } from "sonner";

interface recruiterProfileForm {
  companyName: string;
  companyLocation: string;
  organizationType: string;
}

const RecruiterProfile = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);

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
      const response = await axiosInstance.post(
        "/recruiter/create-profile",
        {
          company_name: data.companyName,
          location: data.companyLocation,
          type_of_organization: data.organizationType,
        }
      );
      if (response.status === 200) {
        console.log("Recruiter profile created successfully", response.data);
        toast.success(response.data.message);
        dispatch(setUser({ ...user, hasprofile: true }));
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
    <div className="w-full min-h-screen flex flex-col bg-light-grey">
      <header className="px-6 sm:px-12 py-5">
        <BrandLogo />
      </header>
      <div className="flex-1 flex justify-center items-center w-full px-4 py-10">
        <div className="bg-white min-h-[485px] w-full sm:w-[600px] md:w-[700px] lg:w-[800px] max-w-full pt-12 rounded-3xl drop-shadow-[0px_6px_40px_rgba(245,245,245,1)] flex justify-center">
          <form
            onSubmit={handleSubmit(onsubmit)}
            className="lg:w-[600px] w-full px-8"
          >
            <h1 className="mb-8 text-dark-grey text-2xl sm:text-3xl font-semibold">
              Complete your recruiter profile
            </h1>
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
              <Controller
                name="companyLocation"
                control={control}
                rules={{ required: "Please select your company's country." }}
                render={({ field }) => (
                  <CountrySelect
                    id="companyLocation"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!errors.companyLocation}
                  />
                )}
              />
              {errors.companyLocation && (
                <p className="text-red text-sm">
                  {errors.companyLocation?.message as string}
                </p>
              )}
            </div>
            <div className="mt-6">
              <label
                htmlFor="organizationType"
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
              <Button
                variant="primary"
                className="h-11 px-8 text-base sm:h-16 sm:px-16 sm:text-xl"
              >
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
