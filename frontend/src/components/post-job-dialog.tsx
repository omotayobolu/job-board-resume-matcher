import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";
import { CloseCircle } from "iconsax-reactjs";
import { Button } from "./ui/button";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSelector } from "react-redux";
import { selectUser } from "@/store/userSlice";
import axios from "axios";
import { useQueryClient } from "@tanstack/react-query";
interface PostJobDialogProps {
  openDialog: boolean;
  setOpenDialog: (open: boolean) => void;
}

interface JobDetails {
  jobTitle: string;
  location: string;
  workplaceType: string;
  jobDescription: string;
  skills: string[];
}

const PostJobDIalog = ({ openDialog, setOpenDialog }: PostJobDialogProps) => {
  const user = useSelector(selectUser);
  const [skill, setSkill] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [isPosting, setIsPosting] = useState(false);

  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors },
  } = useForm<JobDetails>({
    mode: "onTouched",
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && skill.trim()) {
      e.preventDefault();
      if (!skills.includes(skill.trim())) {
        setSkills((prev) => [...prev, skill.trim()]);
        setValue("skills", [...skills, skill.trim()]);
      }
      setSkill("");
    }
  };

  const removeSkill = (skillToRemove: string) => {
    const updatedSkills = skills.filter((s) => s !== skillToRemove);
    setSkills(updatedSkills);
    setValue("skills", updatedSkills);
  };

  const onsubmit = async (data: JobDetails) => {
    try {
      setIsPosting(true);
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/jobs/create-job`,
        {
          recruiter_id: user.id,
          job_details: {
            job_title: data.jobTitle,
            location: data.location,
            work_type: data.workplaceType,
            job_description: data.jobDescription,
            required_skills: data.skills,
          },
        },
        {
          withCredentials: true,
        }
      );
      console.log("Job posted successfully:", response.data);
      queryClient.invalidateQueries({ queryKey: ["recruiterJobs", user.id] });
      reset();
      setSkills([]);
      setOpenDialog(false);
      setIsPosting(false);
    } catch (error) {
      console.error("Error posting job:", error);
      setIsPosting(false);
    }
  };

  return (
    <Dialog open={openDialog} onOpenChange={setOpenDialog}>
      <DialogContent
        style={{
          maxWidth: "800px",
          width: "auto",
          maxHeight: "90vh",
          height: "auto",
        }}
        className="!left-1/2 !-translate-x-1/2 z-50 lg:w-[800px] max-w-full font-inter overflow-y-auto overflow-x-hidden"
      >
        <DialogHeader>
          <DialogTitle>Post a New Job Opening</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onsubmit)} className="mt-9">
          <div className="flex flex-row justify-center items-center gap-8">
            <div className="w-[345px]">
              <label
                className="text-base font-semibold text-[rgba(96,96,96,1)]"
                htmlFor="jobTitle"
              >
                Job Title
              </label>
              <Input
                {...register("jobTitle", { required: "Job title is required" })}
                name="jobTitle"
                id="jobTitle"
                placeholder="E.g. Product Designer"
                className={`${errors.jobTitle ? "border-red" : ""} mt-1.5`}
              />
              {errors.jobTitle && (
                <p className="text-xs text-red mt-1">
                  {errors.jobTitle.message}
                </p>
              )}
            </div>
            <div className="w-[345px]">
              <label
                className="text-base font-semibold text-[rgba(96,96,96,1)]"
                htmlFor="location"
              >
                Location
              </label>
              <Input
                {...register("location", {
                  required: "Location is required",
                })}
                name="location"
                id="location"
                placeholder="United States"
                className={`${errors.location ? "border-red" : ""} mt-1.5`}
              />
              {errors.location && (
                <p className="text-xs text-red mt-1">
                  {errors.location.message}
                </p>
              )}
            </div>
          </div>
          <div className="mt-6">
            <label
              className="text-base font-semibold text-[rgba(96,96,96,1)]"
              htmlFor="workplaceType"
            >
              Workplace Type
            </label>
            <Controller
              name="workplaceType"
              control={control}
              rules={{ required: "Please select a workplace type." }}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger
                    className={`w-[345px] mt-1.5 ${
                      errors.workplaceType ? "border-red" : ""
                    } `}
                  >
                    <SelectValue placeholder="Select a workplace type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onsite">Onsite</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {errors.workplaceType && (
              <p className="text-xs text-red mt-1">
                {errors.workplaceType.message}
              </p>
            )}
          </div>
          <div className="mt-7.5">
            <label
              className="text-base font-semibold text-[rgba(96,96,96,1)]"
              htmlFor="jobDescription"
            >
              Job Description
            </label>
            <Textarea
              {...register("jobDescription", {
                required: "Job description is required",
              })}
              className={`${
                errors.jobDescription ? "border-red" : "border-gray-300"
              } mt-1.5`}
              placeholder="Write whatever details you would like to see in the perfect candidate"
            />
            {errors.jobDescription && (
              <p className="text-xs text-red mt-1">
                {errors.jobDescription.message}
              </p>
            )}
          </div>
          <div className="mt-7.5">
            <label
              className="text-base font-semibold text-[rgba(96,96,96,1)]"
              htmlFor="skills"
            >
              Skills
            </label>
            <div className=" flex flex-row items-start gap-2.5">
              <div>
                <Input
                  type="text"
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter required skills"
                  className={`w-[345px] mt-1.5 ${
                    errors.skills ? "border-red" : ""
                  }`}
                />
                <p className="text-sm text-[rgba(96,96,96,1)] mt-1">
                  Press <strong>Enter</strong> to add a skill
                </p>
              </div>
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-x-2 gap-y-4">
                  {skills.map((skill, index) => (
                    <div
                      key={index}
                      className="bg-[rgba(239,239,239,1)] py-1 px-3 rounded-4xl flex flex-row items-center gap-2"
                    >
                      <CloseCircle
                        size="16"
                        color="#000000"
                        variant="Linear"
                        onClick={() => removeSkill(skill)}
                        className="cursor-pointer"
                      />
                      <p className="font-normal text-sm text-black">{skill}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {errors.skills && (
              <p className="text-xs text-red mt-1">{errors.skills.message}</p>
            )}
          </div>
          <DialogFooter>
            <div className="flex flex-row items-center gap-7.5 mt-10">
              <DialogClose asChild>
                <Button variant="outline" className="py-4.5 px-15">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                variant={isPosting ? "ghost" : "primary"}
                type="submit"
                className="py-4.5 px-15 font-semibold text-lg"
              >
                {isPosting ? "Posting..." : "Post Job"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PostJobDIalog;
