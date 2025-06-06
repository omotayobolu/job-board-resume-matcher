import { Danger, SmsTracking } from "iconsax-reactjs";
import { Button } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Input } from "./ui/input";
import chatbot from "../assets/chatbot.svg";

const RecruiterDashboard = () => {
  return (
    <div className="py-18 px-6">
      <div className="flex flex-row gap-6">
        <div className="w-[70%] ">
          <div className="border border-black rounded-4xl bg-[#6E62E5] p-8">
            <h2 className="text-2xl font-bold text-white font-sf-pro">
              Top Match!
            </h2>
            <p className="mt-6 font-medium text-lg text-white">
              Ayoade Olasubomi matched above 70% in your active Product Designer
              listing. She appears to be the most suitable candidate for this
              role based on her skills, tools and experience.
            </p>
            <div className="mt-4 flex flex-row justify-end items-center gap-4">
              <Button variant="outline" className="py-3 px-6 rounded-3xl ">
                View other applications
              </Button>
              <button className="bg-[rgba(48,48,48,1)] py-1.5 pl-6 pr-[7px] flex items-center justify-between gap-2 w-[209px] rounded-3xl h-12 cursor-pointer">
                <p className="font-medium text-base text-white">
                  Send a message
                </p>
                <div className="bg-white w-8 h-8 rounded-3xl flex justify-center items-center">
                  <SmsTracking variant="Linear" size="16" />
                </div>
              </button>
            </div>
          </div>
          <div className="mt-7 5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Date Posted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applicants</TableHead>
                  <TableHead>Top Match(%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Frontend Developer</TableCell>
                  <TableCell>05/06/2025</TableCell>
                  <TableCell>Active</TableCell>
                  <TableCell>100</TableCell>
                  <TableCell>80%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="w-[28%]">
          <div className="max-h-[414px] h-auto overflow-y-auto border-2 border-[rgba(229,229,229,1)] rounded-4xl p-8 bg-white">
            <h2 className="text-black text-2xl font-semibold">Notifications</h2>
            <div className="mt-6.5">
              <div className="flex flex-row items-center gap-2 pb-1 border-b-[0.7px] border-[rgba(229,229,229,1)]">
                <div className="w-8 h-8 bg-[rgba(243,244,245,1)] rounded-[3rem] flex justify-center items-center flex-shrink-0">
                  <Danger
                    variant="Linear"
                    size="16"
                    color="rgba(62, 35, 72, 1)"
                  />
                </div>
                <p className="text-black text-sm flex-grow">
                  Your job listing for Frontend Developer has received 100
                  applications.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6 max-h-[403px] h-auto overflow-y-auto border-2 border-[rgba(229,229,229,1)] rounded-4xl p-8 bg-white">
            <h2 className="text-black text-2xl font-semibold">Messages</h2>
            <div className="mt-7.5">
              <div className="flex flex-row items-center justify-between gap-2 pb-4.5 border-b-[0.7px] border-[rgba(229,229,229,1)]">
                <div className="flex flex-row items-center gap-2">
                  <div className="h-12 w-12 rounded-[3rem] bg-black flex-shrink-0"></div>
                  <div className="flex flex-col gap-0.5">
                    <h4 className="text-black text-lg font-medium">
                      Ayoade Precious
                    </h4>
                    <p className="text-sm font-normal text-black whitespace-nowrap overflow-hidden text-ellipsis max-xl:max-w-[100px] max-2xl:max-w-[160px] max-w-[250px]">
                      How many hours in a week would
                    </p>
                  </div>
                </div>
                <div className="w-6.5 h-6.5 rounded-3xl bg-purple flex items-center justify-center flex-shrink-0">
                  <p className="text-sm font-normal text-white">1</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6.5 py-4 px-8 border-2 border-[rgba(229,229,229,1)] rounded-4xl bg-white">
            <h2 className="text-black text-2xl font-semibold">AI Chatbot</h2>
            <div className="mt-6 relative">
              <Input
                type="text"
                className="rounded-[26px] pl-15"
                placeholder="Ask.."
              />
              <div className="absolute top-1/2 -translate-y-1/2 left-4">
                <img src={chatbot} alt="" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecruiterDashboard;
