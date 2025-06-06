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
interface PostJobDialogProps {
  openDialog: boolean;
  setOpenDialog: (open: boolean) => void;
}

const PostJobDIalog = ({ openDialog, setOpenDialog }: PostJobDialogProps) => {
  const [skill, setSkill] = useState("");
  const [skills, setSkills] = useState<string[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && skill.trim()) {
      e.preventDefault();
      if (!skills.includes(skill.trim())) {
        setSkills((prev) => [...prev, skill.trim()]);
      }
      setSkill("");
    }
  };

  const removeSkill = (skillToRemove: string) => {
    setSkills((prev) => prev.filter((s) => s !== skillToRemove));
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
        <div className="mt-9">
          <div className="flex flex-row justify-center items-center gap-8">
            <div className="w-[345px]">
              <label
                className="text-base font-semibold text-[rgba(96,96,96,1)]"
                htmlFor="jobTitle"
              >
                Job Title
              </label>
              <Input
                name="jobTitle"
                id="jobTitle"
                placeholder="E.g. Product Designer"
                className="mt-1.5"
              />
            </div>
            <div className="w-[345px]">
              <label
                className="text-base font-semibold text-[rgba(96,96,96,1)]"
                htmlFor="location"
              >
                Location
              </label>
              <Input
                name="location"
                id="location"
                placeholder="United States"
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="mt-6">
            <label
              className="text-base font-semibold text-[rgba(96,96,96,1)]"
              htmlFor="workType"
            >
              Workplace Type
            </label>
            <Select>
              <SelectTrigger className="w-[345px] mt-1.5">
                <SelectValue placeholder="Select a workplace type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="onsite">Onsite</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-7.5">
            <label
              className="text-base font-semibold text-[rgba(96,96,96,1)]"
              htmlFor="jobDescription"
            >
              Job Description
            </label>
            <Textarea
              className="mt-1.5"
              placeholder="Write whatever details you would like to see in the perfect candidate"
            />
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
                  className="w-[345px] mt-1.5"
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
          </div>
        </div>
        <DialogFooter>
          <div className="flex flex-row items-center gap-7.5 mt-10">
            <DialogClose asChild>
              <Button variant="outline" className="py-4.5 px-15">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="primary" type="submit" className="py-4.5 px-15">
              Post job
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PostJobDIalog;
