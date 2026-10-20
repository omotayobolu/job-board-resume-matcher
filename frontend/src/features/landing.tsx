import BrandLogo from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import {
  BriefcaseBusiness,
  FileText,
  ListOrdered,
  MessageSquareText,
  Search,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

interface Feature {
  icon: ReactNode;
  title: string;
  description: string;
}

const recruiterFeatures: Feature[] = [
  {
    icon: <BriefcaseBusiness size={22} />,
    title: "Post a job",
    description:
      "Describe the role, required skills and location. You can open or close the job at any time.",
  },
  {
    icon: <ListOrdered size={22} />,
    title: "See your best fits first",
    description:
      "Applicants who fit the role best show up at the top of your list.",
  },
  {
    icon: <MessageSquareText size={22} />,
    title: "Ask about your applicants",
    description:
      "Ask a question like \"Who has led a team before?\" and get a quick answer from their resumes.",
  },
];

const seekerFeatures: Feature[] = [
  {
    icon: <FileText size={22} />,
    title: "Upload your resume once",
    description:
      "Add a PDF or DOCX resume when you create your profile. It is used for every job you apply to.",
  },
  {
    icon: <Search size={22} />,
    title: "Browse open jobs",
    description: "See the jobs recruiters have posted and apply in one click.",
  },
  {
    icon: <Sparkles size={22} />,
    title: "Get matched on skills",
    description:
      "Your resume is compared with each job's description, so recruiters see how closely you fit the role.",
  },
];

const FeatureList = ({ heading, features }: { heading: string; features: Feature[] }) => (
  <div className="bg-white rounded-3xl p-8 flex-1">
    <h3 className="text-2xl font-semibold text-dark-grey">{heading}</h3>
    <ul className="mt-6 flex flex-col gap-6">
      {features.map((feature) => (
        <li key={feature.title} className="flex gap-4">
          <span className="shrink-0 size-11 rounded-full bg-purple/10 text-purple flex items-center justify-center">
            {feature.icon}
          </span>
          <div>
            <p className="font-semibold text-dark-grey">{feature.title}</p>
            <p className="text-dark-grey/80 mt-1">{feature.description}</p>
          </div>
        </li>
      ))}
    </ul>
  </div>
);

const Landing = () => {
  return (
    <div className="min-h-screen bg-light-grey flex flex-col">
      <header className="flex items-center justify-between px-6 sm:px-12 py-5">
        <BrandLogo />
        <Button asChild variant="primary" className="rounded-full px-6">
          <Link to="/login">Sign in</Link>
        </Button>
      </header>

      <main className="flex-1">
        <section className="px-6 sm:px-12 pt-12 pb-16 text-center max-w-4xl mx-auto">
          <h1 className="font-bold text-dark-grey text-4xl sm:text-6xl leading-tight">
            Hire Better, Apply Smarter.
          </h1>
          <p className="text-dark-grey/80 text-lg sm:text-xl mt-6 leading-8">
            JobBoard matches resumes to job descriptions so recruiters see the
            strongest applicants first and job seekers apply where they fit.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button asChild variant="primary" className="rounded-full h-14 px-8 text-lg">
              <Link to="/signup">Post a job</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-full h-14 px-8 text-lg border-purple text-purple"
            >
              <Link to="/signup">Find a job</Link>
            </Button>
          </div>
        </section>

        <section className="px-6 sm:px-12 pb-16 max-w-6xl mx-auto flex flex-col md:flex-row gap-6">
          <FeatureList heading="For recruiters" features={recruiterFeatures} />
          <FeatureList heading="For job seekers" features={seekerFeatures} />
        </section>

        <section className="px-6 sm:px-12 pb-20 max-w-4xl mx-auto">
          <div className="bg-purple rounded-3xl p-8 sm:p-12 text-center text-white">
            <h2 className="text-2xl sm:text-3xl font-semibold">How matching works</h2>
            <p className="mt-4 text-light-grey leading-7">
              JobBoard reads your resume and the job description and checks
              how well they line up. The better your experience fits the role,
              the higher you appear on the recruiter's list.
            </p>
          </div>
        </section>
      </main>

      <footer className="px-6 sm:px-12 py-6 text-center text-sm text-dark-grey/70">
        JobBoard
      </footer>
    </div>
  );
};

export default Landing;
