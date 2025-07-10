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
import { Add, Send, Trash } from "iconsax-reactjs";
import chatbot from "../assets/chatbot.svg";

const Applicants = () => {
  const [selectedJob, setSelectedJob] = useState("Frontend developer");
  const [isChatOpen, setIsChatOpen] = useState(false);

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
    <div className="py-18 px-6 font-inter relative">
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
            <Button
              variant="outline"
              className="w-1/2 font-normal hover:bg-[#292D32] hover:text-white"
            >
              <Add
                variant="Linear"
                width="24px"
                height="24px"
                color="#292D32"
                className="rotate-45"
              />{" "}
              Close Applications
            </Button>
            <Button
              variant="outline"
              className="w-1/2 font-normal border-[#610D0D hover:bg-[#610D0D] hover:text-white"
            >
              <Trash
                variant="Linear"
                width="24px"
                height="24px"
                color="#610D0D"
              />
              Delete Job
            </Button>
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
      <div
        className="fixed bottom-6 right-6 p-2 rounded-full bg-white cursor-pointer"
        onClick={() => setIsChatOpen(!isChatOpen)}
      >
        {isChatOpen ? (
          <Add
            variant="Linear"
            width="48px"
            height="48px"
            color="#292D32"
            className="rotate-45"
          />
        ) : (
          <img src={chatbot} alt="" />
        )}
      </div>
      {isChatOpen && (
        <div className="absolute bottom-18 right-6 w-[460px] h-[400px] bg-white border border-[#E5E5E5] rounded-lg shadow-lg p-4 flex flex-col">
          <div className="flex flex-row justify-between items-center mb-4">
            <h4 className="text-lg font-medium text-black">Chatbot</h4>
            <button
              className="cursor-pointer"
              onClick={() => setIsChatOpen(false)}
            >
              <Add
                variant="Linear"
                width="36px"
                height="36px"
                color="#292D32"
                className="rotate-45"
              />
            </button>
          </div>
          <div className="flex flex-col flex-1 gap-2 overflow-y-auto w-full">
            <div className="bg-[#F5F7FB] p-3 rounded-lg text-sm text-black">
              Hello! How can I assist you today?
            </div>
            <div className="bg-[#F5F7FB] w-[100px]  py-2 px-5 rounded-r-[26px] rounded-tl-[26px] text-white relative flex flex-row items-center gap-1">
              <div className="w-4 h-4 rounded-full bg-[#BFBDBD] animate-bounce"></div>
              <div className="w-4 h-4 rounded-full bg-[#D1D1D1] animate-bounce delay-150"></div>
              <div className="w-4 h-4 rounded-full bg-[#E5E5E5] animate-bounce delay-300"></div>
            </div>
            <div className="bg-purple flex  self-end w-[250px] py-3 px-5 rounded-l-[26px] rounded-tr-[26px] text-white">
              You can ask about applicants, job listings, or any other queries.
            </div>
          </div>
          <div className="mt-4 flex flex-row items-center gap-2">
            <div className="relative flex-1">
              <textarea
                className="flex-1 w-full border border-[#E5E5E5] bg-[#F5F7FB] rounded-[22px] px-12 pt-3.5 pb-2.5 text-base outline-none resize-none leading-tight overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap placeholder:overflow-hidden"
                placeholder="Ask about applicants"
                rows={1}
                style={{
                  minHeight: "48px",
                  maxHeight: "120px",
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height =
                    Math.min(target.scrollHeight, 120) + "px";
                }}
              />
              <img
                src={chatbot}
                alt=""
                className="absolute top-1/2 -translate-y-1/2 left-2"
              />
              <button className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer">
                <Send variant="Bold" size={24} color="#434448" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Applicants;
