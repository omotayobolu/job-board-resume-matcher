import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import SearchIcon from "../assets/search.svg";
import ExportIcon from "../assets/export.svg";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

const Applicants = () => {
  const [selectedJob, setSelectedJob] = useState("Frontend developer");

  const applicants = [
    {
      name: "John Doe",
      matchScore: "85%",
      status: "Pending",
      dateApplied: "2025-06-10",
    },
    {
      name: "Jane Smith",
      matchScore: "92%",
      status: "Reviewed",
      dateApplied: "2025-06-09",
    },
    {
      name: "Alice Johnson",
      matchScore: "78%",
      status: "Interviewed",
      dateApplied: "2025-06-08",
    },
  ];
  return (
    <div className="py-18 px-6 font-inter">
      <h2 className="font-semibold text-2xl text-black">Applicants</h2>
      <div className="mt-7 w-full flex flex-row items-start gap-7.5">
        <div className="w-[70%]">
          <h4 className="text-xl font-medium text-black">
            Job Description Summary
          </h4>
          <div className="mt-2 border border-[#E5E5E5] bg-white rounded-3xl p-5 pb-11.5">
            <p className="text-sm font-normal text-[#4A4A4A]">
              We are looking for a Product Designer to work on various products
              we develop for our customers. Product Designer responsibilities
              include defining product specifications, creating digital or print
              drawings and designing fully-functional products. To be successful
              in this role, you should have an eye for color and shape and be
              able to translate requirements into practical product features.
              Ultimately, you will help us build products that are easy to use
              and visually appealing to our potential customers
            </p>
            <div className="mt-5 flex flex-row items-center gap-5">
              <p className="text-base font-semibold">Skills: </p>
              <div className="flex flex-row items-center gap-2">
                <div className="bg-[#E5E5E5] py-1 px-3 rounded-4xl">
                  <span className="text-xs font-normal">Product Design</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="w-[30%]">
          <h4 className="text-xl font-medium text-black">Job Listing</h4>
          <Select
            value={selectedJob}
            onValueChange={(job) => setSelectedJob(job)}
          >
            <SelectTrigger className="border-gray-300 mt-2 bg-white rounded-none text-black">
              <SelectValue>{selectedJob}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="company">Company</SelectItem>
              <SelectItem value="startup">Startup</SelectItem>
              <SelectItem value="solopreneur">Solopreneur</SelectItem>
              <SelectItem value="agency">Agency</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex flex-row items-center gap-2 mt-2 w-full">
            <Button className="w-1/2">Close Applications</Button>
            <Button className="w-1/2">Delete Job</Button>
          </div>
          <div className="mt-7.5 flex justify-end items-center gap-4">
            <div className="border border-[#E5E5E5] bg-white rounded-md p-3">
              <img src={SearchIcon} alt="" />
            </div>
            <div className="border border-[#E5E5E5] bg-white rounded-md p-3">
              <img src={ExportIcon} alt="" />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-7.5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Checkbox />
              </TableHead>
              <TableHead>Applicant's Name</TableHead>
              <TableHead>Match Score (%)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date Applied</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applicants.map((applicant, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Checkbox />
                </TableCell>
                <TableCell>{applicant.name}</TableCell>
                <TableCell>{applicant.matchScore}</TableCell>
                <TableCell>{applicant.status}</TableCell>
                <TableCell>{applicant.dateApplied}</TableCell>
                <TableCell>
                  <Button variant="primary" size="md">
                    Message
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Applicants;
