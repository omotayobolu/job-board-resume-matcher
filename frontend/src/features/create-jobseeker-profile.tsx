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
import type { RootState } from "@/store/store";
import { setUser } from "@/store/userSlice";
import { axiosInstance } from "@/lib/axios-instance";
import { getApiErrorMessage } from "@/lib/api-error";
import { FolderAdd } from "iconsax-reactjs";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router";
import { toast } from "sonner";

interface JobseekerProfileForm {
  jobTitle: string;
  jobPreference: string;
  location: string;
  resume: FileList | null;
}

const JobseekerProfile = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.user.user);
  const [iscreatingProfile, setIsCreatingProfile] = useState(false);
  const {
    control,
    formState: { errors },
    watch,
    register,
    handleSubmit,
  } = useForm<JobseekerProfileForm>({
    mode: "onTouched",
  });

  const onsubmit = async (data: JobseekerProfileForm) => {
    const resume = data.resume?.[0];
    if (!resume) {
      toast.error("Please upload your resume.");
      return;
    }

    const formData = new FormData();
    formData.append("job_title", data.jobTitle);
    formData.append("location", data.location);
    formData.append("remote_preference", data.jobPreference);
    formData.append("resume", resume);

    setIsCreatingProfile(true);
    try {
      const response = await axiosInstance.post(
        "/job-seeker/create-profile",
        formData
      );
      if (response.status === 202) {
        toast.info(response.data.message);
        dispatch(setUser({ ...user, hasprofile: true }));
        navigate("/dashboard");
      } else {
        toast.error("Could not save your profile. Please try again.");
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsCreatingProfile(false);
    }
  };
  return (
    <div className="w-full min-h-screen flex flex-col bg-light-grey font-sf-pro">
      <header className="px-6 sm:px-12 py-5">
        <BrandLogo />
      </header>
      <div className="flex-1 flex justify-center items-center w-full px-4 py-10">
        <form
          onSubmit={handleSubmit(onsubmit)}
          className="bg-white min-h-[485px] w-full sm:w-[600px] md:w-[700px] lg:w-[800px] max-w-full pt-10 pb-8 px-8 rounded-3xl shadow-lg flex flex-col gap-8"
        >
          <div className="flex flex-row items-start gap-8">
            <div className="flex flex-col w-full">
              <label
                htmlFor="jobTitle"
                className="text-[#212A37] font-medium text-base mb-2"
              >
                Job Role
              </label>
              <Input
                id="jobTitle"
                type="text"
                placeholder="Enter your desired job role"
                {...register("jobTitle", {
                  required: "Please enter your job title.",
                })}
                className={`${errors.jobTitle ? "border-red" : ""}`}
              />
              {errors.jobTitle && (
                <p className="text-red text-sm mt-1">
                  {errors.jobTitle?.message as string}
                </p>
              )}
            </div>
            <div className="flex flex-col w-full">
              <label
                htmlFor="jobPreference"
                className="text-[#212A37] font-medium text-base mb-2"
              >
                Preferred Work Setup
              </label>
              <Controller
                name="jobPreference"
                control={control}
                rules={{ required: "Select a preferred work setup" }}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger
                      className={`px-4 py-2 ${
                        errors.jobPreference ? "border-red" : ""
                      }`}
                    >
                      <SelectValue placeholder="Select Work Setup" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="remote">Remote</SelectItem>
                      <SelectItem value="onsite">Onsite</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.jobPreference && (
                <p className="text-red text-sm mt-1">
                  {errors.jobPreference?.message as string}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-row items-start gap-8">
            <div className="flex flex-col w-full">
              <label
                htmlFor="location"
                className="text-[#212A37] font-medium text-base mb-2"
              >
                Location
              </label>
              <Controller
                name="location"
                control={control}
                rules={{ required: "Please select your country." }}
                render={({ field }) => (
                  <CountrySelect
                    id="location"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!errors.location}
                  />
                )}
              />
              {errors.location && (
                <p className="text-red text-sm mt-1">
                  {errors.location?.message as string}
                </p>
              )}
            </div>
            <div className="flex flex-col w-full">
              <p className="text-[#212A37] font-medium text-base mb-2">
                Upload your resume/CV
              </p>
              <label
                htmlFor="upload"
                className={`cursor-pointer border ${
                  errors.resume
                    ? "border-red"
                    : "border-dashed border-[#E5E5E5]"
                }  rounded-xl w-full h-[150px] flex flex-col items-center justify-center gap-2 bg-[#F9FAFB] hover:bg-[#F5F7FB]`}
              >
                <FolderAdd size={32} color="#808489" variant="Linear" />
                {watch("resume")?.[0] ? (
                  <p className="text-sm mx-1 text-center">
                    {watch("resume")?.[0].name}
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-[#212A37]">
                      Drop your file here, or browse
                    </p>
                    <span className="text-[#95989F] font-normal text-xs">
                      PDF or DOCX, up to 5 MB
                    </span>
                  </>
                )}
                <input
                  id="upload"
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx"
                  {...register("resume", {
                    required: "Please upload your resume.",
                    validate: (files) =>
                      !files?.[0] ||
                      files[0].size <= 5 * 1024 * 1024 ||
                      "Your resume must be 5 MB or smaller.",
                  })}
                />
              </label>
              {errors.resume && (
                <p className="text-red text-sm mt-1">
                  {errors.resume.message as string}
                </p>
              )}
            </div>
          </div>
          <div className="my-8 text-center">
            <Button
              variant={iscreatingProfile ? "ghost" : "primary"}
              className="py-8 px-16 text-xl"
              disabled={iscreatingProfile}
            >
              {iscreatingProfile
                ? "Creating Profile..."
                : "Join as a jobseeker"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default JobseekerProfile;
